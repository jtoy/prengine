require "json"
require "fileutils"
require "pathname"
require_relative "llm_client"

# Generates verification screenshots scripts using an LLM.
# Given the diff and bug report, produces .bugfix/verify.sh, screenshot.spec.js,
# and playwright.config.js tailored to the specific fix.
module VerificationGenerator
  # Returns true if the repo looks like a web app with a UI to screenshot.
  def self.web_app?(repo_dir)
    pkg_path = find_package_json(repo_dir)
    return false unless pkg_path

    pkg = JSON.parse(File.read(pkg_path)) rescue {}
    scripts = pkg["scripts"] || {}
    deps = (pkg["dependencies"] || {}).merge(pkg["devDependencies"] || {})

    # Has a start/dev command and uses a UI framework
    has_server = scripts.key?("start") || scripts.key?("dev")
    has_ui = deps.keys.any? { |d| %w[react next vue svelte angular p5 three].any? { |f| d.include?(f) } }
    has_server && has_ui
  end

  # Generate .bugfix/ verification files for a repo based on the diff and bug report.
  # Returns true if files were generated, false otherwise.
  def self.generate(repo_dir, diff_text, prompt)
    pkg_path = find_package_json(repo_dir)
    return false unless pkg_path

    pkg = JSON.parse(File.read(pkg_path)) rescue {}
    scripts = pkg["scripts"] || {}
    pkg_dir = File.dirname(pkg_path)
    # Relative path from repo root to the package.json directory
    pkg_rel = pkg_dir == repo_dir ? "." : Pathname.new(pkg_dir).relative_path_from(Pathname.new(repo_dir)).to_s

    # Figure out the dev server command and port
    dev_cmd = scripts["dev"] || scripts["start"] || "npm start"
    port = extract_port(scripts) || 3000

    llm_prompt = <<~P
      You are generating a Playwright verification script to screenshot a web app after a bug fix.

      BUG REPORT:
      #{prompt}

      DIFF (what was changed):
      #{diff_text[0..3000]}

      PACKAGE.JSON SCRIPTS:
      #{scripts.to_json}

      APP DIRECTORY (relative to repo root): #{pkg_rel}
      DEV SERVER URL: http://127.0.0.1:#{port}

      Generate ONLY the Playwright test file content (JavaScript, CommonJS require syntax).
      The test should:
      1. Navigate to the page most relevant to the bug fix
      2. Wait for the page to be fully loaded (prefer waitForSelector or networkidle, NOT custom globals like window.isReady)
      3. Take a full-page screenshot saved to: path.join(SCREENSHOT_DIR, 'full-page.png')
      4. Take a screenshot of the specific area affected by the fix saved to: path.join(SCREENSHOT_DIR, 'detail.png')

      Use this exact structure:
      ```
      const { test } = require('@playwright/test');
      const path = require('path');
      const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');

      test('verification screenshot', async ({ page }) => {
        // your code here
      });
      ```

      Return ONLY the JavaScript code, no markdown fences, no explanation.
    P

    spec_content = LLMClient.generate(llm_prompt)
    return false if spec_content.nil? || spec_content.empty?

    # Clean up markdown fences if the LLM included them
    spec_content = spec_content.gsub(/\A```(?:javascript|js)?\n?/, "").gsub(/\n?```\z/, "").strip

    bugfix_dir = File.join(repo_dir, ".bugfix")
    FileUtils.mkdir_p(bugfix_dir)

    # Write screenshot spec
    File.write(File.join(bugfix_dir, "screenshot.spec.js"), spec_content + "\n")

    # Write playwright config
    npm_cmd = scripts.key?("dev") ? "npm run dev" : "npm start"
    config_content = generate_config(port, npm_cmd, pkg_rel)
    File.write(File.join(bugfix_dir, "playwright.config.js"), config_content)

    # Write verify.sh
    verify_content = generate_verify_sh(pkg_rel)
    verify_path = File.join(bugfix_dir, "verify.sh")
    File.write(verify_path, verify_content)
    File.chmod(0o755, verify_path)

    puts "[VerificationGenerator] Generated .bugfix/ files for #{File.basename(repo_dir)}"
    true
  rescue => e
    puts "[VerificationGenerator] Error: #{e.message}"
    false
  end

  private

  # Find package.json — could be at repo root or in a subdirectory
  def self.find_package_json(repo_dir)
    # Check repo root first
    root_pkg = File.join(repo_dir, "package.json")
    return root_pkg if File.exist?(root_pkg)

    # Check common subdirectories
    %w[frontend client app web src reactapp].each do |sub|
      sub_pkg = File.join(repo_dir, sub, "package.json")
      return sub_pkg if File.exist?(sub_pkg)
    end

    nil
  end

  def self.extract_port(scripts)
    # Try to extract port from dev/start scripts
    cmd = scripts["dev"] || scripts["start"] || ""
    match = cmd.match(/(?:--port|PORT=|-p)\s*(\d+)/)
    match ? match[1].to_i : nil
  end

  def self.generate_config(port, npm_cmd, pkg_rel)
    cwd_line = pkg_rel == "." ? "" : "    cwd: '#{pkg_rel}',"

    <<~JS
      const { defineConfig, devices } = require('@playwright/test');

      module.exports = defineConfig({
        testDir: '.',
        fullyParallel: false,
        retries: 0,
        workers: 1,
        reporter: 'list',
        timeout: 60000,
        use: {
          baseURL: 'http://127.0.0.1:#{port}',
          headless: true,
        },
        projects: [
          {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
          },
        ],
        webServer: {
          command: '#{npm_cmd}',
          url: 'http://127.0.0.1:#{port}',
          reuseExistingServer: true,
          timeout: 120000,
      #{cwd_line}
        },
      });
    JS
  end

  def self.generate_verify_sh(pkg_rel)
    if pkg_rel == "."
      npx_prefix = ""
      cd_lines = ""
    else
      npx_prefix = ""
      cd_lines = "cd #{pkg_rel}\n"
    end

    <<~SH
      #!/bin/bash
      # Auto-generated verification script
      set -e

      cd "$(dirname "$0")/.."

      SCREENSHOT_DIR=".bugfix/screenshots"
      rm -rf "$SCREENSHOT_DIR"
      mkdir -p "$SCREENSHOT_DIR"

      #{cd_lines}npx playwright test ../.bugfix/screenshot.spec.js \\
        --config=../.bugfix/playwright.config.js \\
        2>&1 >&2
      #{cd_lines.empty? ? "" : "cd ..\n"}
      for f in "$SCREENSHOT_DIR"/*.png; do
        [ -f "$f" ] && echo "$f"
      done
    SH
  end
end
