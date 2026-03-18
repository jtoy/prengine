require "dotenv/load"
require "json"

module Config
  DATABASE_URL     = ENV.fetch("DATABASE_URL")
  REDIS_URL        = ENV.fetch("REDIS_URL", "redis://localhost:6379")
  GITHUB_TOKEN     = ENV.fetch("GITHUB_TOKEN")
  WORK_DIR         = ENV.fetch("WORK_DIR", "/tmp/bugfixvibe")
  NGROK_AUTHTOKEN  = ENV.fetch("NGROK_AUTHTOKEN", "")
  MAX_CONCURRENCY  = ENV.fetch("MAX_CONCURRENCY", "3").to_i
  LLM_PROVIDER     = ENV.fetch("LLM_PROVIDER", "ollama")       # ollama | anthropic
  LLM_MODEL        = ENV.fetch("LLM_MODEL", "gemma3")          # model name
  OLLAMA_URL       = ENV.fetch("OLLAMA_URL", "http://localhost:11434")
  GEMINI_API_KEY   = ENV.fetch("GEMINI_API_KEY", "")
  CACHE_DIR         = File.join(WORK_DIR, "cache")
  QUEUE_KEY        = "bugfixvibe:jobs"
  STATUS_CHANNEL   = "bugfixvibe:status"
end
