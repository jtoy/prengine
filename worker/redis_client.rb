require "redis"
require "json"
require_relative "config"

module RedisClient
  @mutex = Mutex.new

  # Dedicated connection for BRPOP (main thread only)
  def self.queue_connection
    @queue_connection ||= Redis.new(url: Config::REDIS_URL)
  end

  # Per-thread connections for PUBLISH and other commands
  def self.connection
    thread_id = Thread.current.object_id
    @mutex.synchronize do
      @connections ||= {}
      @connections[thread_id] ||= Redis.new(url: Config::REDIS_URL)
    end
  end

  # Block and pop from the job queue (main thread only)
  def self.pop_job(timeout: 0)
    _key, raw = queue_connection.brpop(Config::QUEUE_KEY, timeout: timeout)
    return nil unless raw
    JSON.parse(raw, symbolize_names: true)
  end

  # Publish a status update for a specific job (thread-safe)
  def self.publish_status(job_id, payload)
    channel = "#{Config::STATUS_CHANNEL}:#{job_id}"
    connection.publish(channel, payload.to_json)
  end
end
