require "pg"
require_relative "config"

module DB
  @mutex = Mutex.new
  @connections = {}

  # Each thread gets its own PG connection
  def self.connection
    thread_id = Thread.current.object_id
    @mutex.synchronize do
      @connections[thread_id] ||= PG.connect(Config::DATABASE_URL)
    end
  end

  def self.query(sql, params = [])
    connection.exec_params(sql, params)
  rescue PG::ConnectionBad => e
    # Reconnect on stale connection
    thread_id = Thread.current.object_id
    @mutex.synchronize { @connections.delete(thread_id) }
    retry
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
end
