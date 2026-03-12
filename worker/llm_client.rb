require "json"
require "net/http"
require "uri"
require_relative "config"

# Configurable LLM client — supports ollama and anthropic
# Set LLM_PROVIDER=ollama|anthropic and LLM_MODEL in .env
module LLMClient
  PROVIDER = Config::LLM_PROVIDER
  MODEL    = Config::LLM_MODEL

  # Send a prompt to the configured LLM, return the text response.
  # Returns nil on failure.
  def self.generate(prompt, system: nil)
    puts "[LLM] Provider: #{PROVIDER}, Model: #{MODEL}"
    case PROVIDER
    when "ollama"
      ollama_generate(prompt, system: system)
    when "anthropic"
      anthropic_generate(prompt, system: system)
    else
      puts "[LLM] Unknown provider: #{PROVIDER}"
      nil
    end
  rescue => e
    puts "[LLM] Error: #{e.message}"
    nil
  end

  private

  def self.ollama_generate(prompt, system: nil)
    uri = URI("#{Config::OLLAMA_URL}/api/generate")
    body = {
      model: MODEL,
      prompt: prompt,
      stream: false,
    }
    body[:system] = system if system

    req = Net::HTTP::Post.new(uri, "Content-Type" => "application/json")
    req.body = body.to_json

    http = Net::HTTP.new(uri.host, uri.port)
    http.read_timeout = 120
    resp = http.request(req)

    if resp.code.to_i == 200
      data = JSON.parse(resp.body)
      text = data["response"].to_s.strip
      puts "[LLM] Response: #{text.length} chars"
      text.empty? ? nil : text
    else
      puts "[LLM] Ollama HTTP #{resp.code}: #{resp.body[0..200]}"
      nil
    end
  end

  def self.anthropic_generate(prompt, system: nil)
    api_key = ENV["ANTHROPIC_API_KEY"]
    unless api_key
      puts "[LLM] No ANTHROPIC_API_KEY set"
      return nil
    end

    uri = URI("https://api.anthropic.com/v1/messages")
    messages = [{ role: "user", content: prompt }]
    body = {
      model: MODEL,
      max_tokens: 1024,
      messages: messages,
    }
    body[:system] = system if system

    req = Net::HTTP::Post.new(uri)
    req["Content-Type"] = "application/json"
    req["x-api-key"] = api_key
    req["anthropic-version"] = "2023-06-01"
    req.body = body.to_json

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.read_timeout = 60
    resp = http.request(req)

    if resp.code.to_i == 200
      data = JSON.parse(resp.body)
      text = data.dig("content", 0, "text").to_s.strip
      puts "[LLM] Response: #{text.length} chars"
      text.empty? ? nil : text
    else
      puts "[LLM] Anthropic HTTP #{resp.code}: #{resp.body[0..200]}"
      nil
    end
  end
end
