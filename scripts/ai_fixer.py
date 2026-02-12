import os
import sys
import json
import base64
import subprocess
from github import Github, Auth
import google.generativeai as genai

# Configuration
GEMINI_MODEL = "models/gemini-1.5-flash" # Use Flash for stable quota and high-speed validation
ISSUE_NUMBER = int(os.getenv("ISSUE_NUMBER"))
REPO_NAME = os.getenv("REPO_NAME")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def validate_code():
    """Runs linting and basic checks to ensure the proposed fix doesn't break the app."""
    print("Running Pre-Flight Validation...")
    
    # 1. Check Backend Syntax
    try:
        subprocess.check_output(["python3", "-m", "compileall", "backend/app"], stderr=subprocess.STDOUT)
        print("✅ Backend syntax check passed.")
    except subprocess.CalledProcessError as e:
        return False, f"Backend Syntax Error:\n{e.output.decode()}"

    # 2. Check Frontend Linting
    try:
        # We run lint from the frontend directory
        subprocess.check_output(["npm", "run", "lint"], cwd="frontend", stderr=subprocess.STDOUT)
        print("✅ Frontend linting passed.")
    except subprocess.CalledProcessError as e:
        return False, f"Frontend Linting Error:\n{e.output.decode()}"

    return True, "All checks passed."

def main():
    if not GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY not set")
        sys.exit(1)

    # 1. Initialize Clients
    auth = Auth.Token(GITHUB_TOKEN)
    g = Github(auth=auth)
    repo = g.get_repo(REPO_NAME)
    genai.configure(api_key=GEMINI_API_KEY)
    
    # Programmatically find available models
    available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
    
    target_model = GEMINI_MODEL
    if target_model not in available_models:
        flashes = [m for m in available_models if "flash" in m.lower()]
        target_model = flashes[0] if flashes else available_models[0]
    
    print(f"Using Model: {target_model}")
    model = genai.GenerativeModel(target_model)
    issue = repo.get_issue(number=ISSUE_NUMBER)

    print(f"Analyzing Issue #{ISSUE_NUMBER}: {issue.title}")

    # 2. Gather Context
    file_structure = []
    important_files = {}
    
    for root, dirs, files in os.walk("."):
        if any(x in root for x in [".git", "venv", "node_modules", "__pycache__", "dist"]):
            continue
        for file in files:
            path = os.path.join(root, file).replace("./", "")
            file_structure.append(path)
            if file.endswith((".py", ".jsx", ".css", ".html", ".js", ".md", ".sh")):
                try:
                    with open(path, "r") as f:
                        important_files[path] = f.read()
                except:
                    pass

    context_str = "FILE STRUCTURE:\n" + "\n".join(file_structure) + "\n\n"
    context_str += "FILE CONTENTS:\n"
    for path, content in important_files.items():
        context_str += f"--- FILE: {path} ---\n{content}\n\n"

    # 3. Prompt Gemini
    prompt = f"""
You are an expert AI software engineer for the OpenSoak project.
An issue has been reported:

TITLE: {issue.title}
DESCRIPTION: {issue.body}

YOUR TASK:
1. Analyze the codebase provided below.
2. Determine which files need to be changed to fix the issue.
3. Provide the NEW COMPLETE CONTENT for each modified file.

CONSTRAINTS:
- Do not make unnecessary changes.
- Adhere to the existing code style.
- Ensure the code is syntactically correct (no duplicate declarations, no stray characters).
- Provide the FULL content of the file.

RESPONSE FORMAT:
Your response must be a valid JSON object:
{{
  "explanation": "Briefly explain what was wrong and how you fixed it.",
  "files": [
    {{
      "path": "path/to/file.py",
      "content": "Full new content..."
    }}
  ]
}}

DO NOT provide any text outside the JSON block.

CODEBASE CONTEXT:
{context_str}
"""

    # Retry loop for validation
    attempts = 0
    while attempts < 2:
        response = model.generate_content(prompt)
        try:
            clean_json = response.text.strip()
            if clean_json.startswith("```json"): clean_json = clean_json[7:-3].strip()
            elif clean_json.startswith("```"): clean_json = clean_json[3:-3].strip()
            data = json.loads(clean_json)
        except Exception as e:
            print(f"Failed to parse JSON: {e}")
            attempts += 1
            continue

        # 4. Apply Changes Locally for Validation
        for file_data in data["files"]:
            os.makedirs(os.path.dirname(file_data["path"]), exist_ok=True)
            with open(file_data["path"], "w") as f:
                f.write(file_data["content"])

        # 5. Validate
        success, message = validate_code()
        if success:
            break
        else:
            print(f"Validation failed: {message}")
            prompt += f"\n\nYour previous attempt failed validation with this error:\n{message}\nPlease fix the errors and try again."
            attempts += 1

    if not success:
        issue.create_comment(f"❌ AI Agent failed to generate a valid fix after multiple attempts. Manual intervention required.\n\n**Validation Error:**\n```\n{message}\n```")
        sys.exit(1)

    # 6. Push to GitHub and Create PR
    branch_name = f"ai-fix-issue-{ISSUE_NUMBER}"
    base_branch = repo.default_branch
    sb = repo.get_branch(base_branch)
    try:
        repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
    except:
        pass # Branch might already exist

    for file_data in data["files"]:
        path = file_data["path"]
        content = file_data["content"]
        contents = repo.get_contents(path, ref=branch_name)
        repo.update_file(path, f"AI Fix: {issue.title}", content, contents.sha, branch=branch_name)

    pr_body = f"""
## AI-Generated Fix for Issue #{ISSUE_NUMBER}

**Explanation:**
{data['explanation']}

**Closes #{ISSUE_NUMBER}**

---
*Generated by the OpenSoak AI Fixer Agent.*
"""
    pr = repo.create_pull(
        title=f"AI Fix: {issue.title}",
        body=pr_body,
        head=branch_name,
        base=base_branch
    )

    issue.create_comment(f"AI Agent has proposed a fix in Pull Request #{pr.number}")
    
    # 7. Notify Discord
    discord_webhook = os.getenv("DISCORD_WEBHOOK_URL")
    if discord_webhook:
        import requests
        requests.post(discord_webhook, json={
            "content": f"🤖 **AI Agent Fix Ready!**\nIssue #{ISSUE_NUMBER}: {issue.title}\n**PR:** {pr.html_url}\n\n*Merging this PR will automatically close the issue.*"
        })

if __name__ == "__main__":
    main()
