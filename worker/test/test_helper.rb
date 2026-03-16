require "minitest/autorun"
require "mocha/minitest"
require "json"
require "fileutils"

# Remove the worker dir from load path to avoid conflicts with redis-client gem
$LOAD_PATH.reject! { |p| p == File.expand_path("../..", __FILE__) || p == File.expand_path("..", __dir__) }

# Now require the gems - they won't pick up worker/redis_client.rb
require "redis"

# Stub env vars before loading config
ENV["DATABASE_URL"] ||= "postgres://localhost/test_db"
ENV["REDIS_URL"] ||= "redis://localhost:6379"
ENV["GITHUB_TOKEN"] ||= "test-github-token"
ENV["REPOS"] ||= "owner/repo1,owner/repo2"
ENV["WORK_DIR"] ||= "/tmp/prengine-test"
ENV["LLM_PROVIDER"] ||= "ollama"
ENV["LLM_MODEL"] ||= "test-model"
ENV["OLLAMA_URL"] ||= "http://localhost:11434"
ENV["GEMINI_API_KEY"] ||= ""
ENV["REPO_DESCRIPTIONS"] ||= '{}'

require_relative "../config"
