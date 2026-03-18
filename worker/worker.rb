#!/usr/bin/env ruby

$stdout.sync = true
$stderr.sync = true

require_relative "config"
require_relative "redis_client"
require_relative "db"
require_relative "job_processor"

MAX = Config::MAX_CONCURRENCY
slots = Queue.new
MAX.times { slots << true }
active = Mutex.new
active_jobs = {}

puts "=== BugFixVibe Worker ==="
puts "Listening on queue: #{Config::QUEUE_KEY}"
puts "Max concurrency: #{MAX}"
puts "Work directory: #{Config::WORK_DIR}"
puts "Configured repos: #{DB.get_enabled_repos.join(', ')}"
puts ""

loop do
  begin
    message = RedisQueue.pop_job(timeout: 5)
    next unless message

    job_id = message[:job_id]

    # Wait for a free slot
    slots.pop
    puts "[Worker] Slot acquired — #{slots.size}/#{MAX} slots free"

    Thread.new(message) do |msg|
      jid = msg[:job_id]
      active.synchronize { active_jobs[jid] = { thread: Thread.current, message: msg } }

      begin
        puts "[Worker] Starting: #{msg[:type]} for job ##{jid}"
        processor = JobProcessor.new
        processor.process(msg)
        puts "[Worker] Done: job ##{jid}"
      rescue => e
        puts "[Worker] Thread error on job ##{jid}: #{e.message}"
        puts e.backtrace.first(5).join("\n")

        # Re-queue on crash so the job isn't lost
        begin
          RedisQueue.requeue(msg)
          puts "[Worker] Re-queued job ##{jid} after crash"
        rescue => req_err
          puts "[Worker] Failed to re-queue job ##{jid}: #{req_err.message}"
        end
      ensure
        active.synchronize { active_jobs.delete(jid) }
        slots << true
        puts "[Worker] Slot released — #{slots.size}/#{MAX} slots free"
      end
    end

  rescue Redis::BaseConnectionError => e
    puts "[Worker] Redis connection error: #{e.message}. Retrying in 5s..."
    sleep 5
  rescue => e
    puts "[Worker] Unexpected error: #{e.message}"
    puts e.backtrace.first(5).join("\n")
    sleep 1
  end
end
