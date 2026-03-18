require "pg"
require_relative "config"

module DB
  # Connect-per-query: opens a connection, runs the query, and closes it.
  # This lets Neon scale to zero between jobs instead of holding a persistent
  # connection that keeps the compute active (billed per second).
  def self.query(sql, params = [])
    conn = PG.connect(Config::DATABASE_URL)
    conn.exec_params(sql, params)
  ensure
    conn&.close
  end

  def self.update_job(job_id, fields)
    sets = []
    values = []
    fields.each_with_index do |(key, value), i|
      sets << "#{key} = $#{i + 1}"
      values << value
    end
    sets << "updated_at = NOW()"
    values << job_id

    query(
      "UPDATE jobs SET #{sets.join(', ')} WHERE id = $#{values.size} RETURNING *",
      values
    )
  end

  def self.update_run(run_id, fields)
    sets = []
    values = []
    fields.each_with_index do |(key, value), i|
      sets << "#{key} = $#{i + 1}"
      values << value
    end
    values << run_id

    query(
      "UPDATE job_runs SET #{sets.join(', ')} WHERE id = $#{values.size} RETURNING *",
      values
    )
  end

  def self.create_run(job_id, run_number, prompt = nil)
    query(
      "INSERT INTO job_runs (job_id, run_number, status, prompt) VALUES ($1, $2, 'pending', $3) RETURNING *",
      [job_id, run_number, prompt]
    )
  end

  def self.get_job(job_id)
    result = query("SELECT * FROM jobs WHERE id = $1", [job_id])
    result.ntuples > 0 ? result[0] : nil
  end

  def self.get_latest_run(job_id)
    result = query(
      "SELECT * FROM job_runs WHERE job_id = $1 ORDER BY run_number DESC LIMIT 1",
      [job_id]
    )
    result.ntuples > 0 ? result[0] : nil
  end

  def self.next_run_number(job_id)
    result = query(
      "SELECT COALESCE(MAX(run_number), 0) + 1 as next_run FROM job_runs WHERE job_id = $1",
      [job_id]
    )
    result[0]["next_run"].to_i
  end

  def self.insert_log(job_id, level, source, message)
    query(
      "INSERT INTO job_logs (job_id, level, source, message) VALUES ($1, $2, $3, $4)",
      [job_id, level, source, message]
    )
  rescue => e
    $stderr.puts "[DB.insert_log] Failed to write log: #{e.message}"
  end

  # --- Repository config (from repositories table) ---

  def self.get_enabled_repos
    result = query("SELECT name FROM repositories WHERE enabled = true ORDER BY id")
    result.map { |r| r["name"] }
  end

  def self.get_repo_branch(repo_name)
    result = query("SELECT base_branch FROM repositories WHERE name = $1 AND enabled = true", [repo_name])
    result.ntuples > 0 ? result[0]["base_branch"] : "main"
  end

  def self.get_repo_descriptions
    result = query("SELECT name, description FROM repositories WHERE enabled = true ORDER BY id")
    result.each_with_object({}) do |r, h|
      h[r["name"]] = r["description"] unless r["description"].to_s.empty?
    end
  end
end
