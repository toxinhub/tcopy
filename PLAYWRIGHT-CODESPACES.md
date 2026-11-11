# Playwright MCP Browser Lab

This branch adds a GitHub Codespaces development container with Microsoft's Playwright MCP server configured for VS Code.

## Sites covered

- tcopy: https://toxinhub.github.io/tcopy/
- CineTon: https://toxinhub.github.io/cineton/
- m}note: https://toxinhub.github.io/mnote/

## Start the browser lab

1. Open this branch in GitHub: `setup/playwright-mcp-codespaces`.
2. Select **Code → Codespaces → Create codespace on setup/playwright-mcp-codespaces**.
3. Wait for the Codespace to finish creating. The dev container provides Node.js 22 and configures the Playwright MCP server.
4. Open the VS Code Chat view and switch to **Agent** mode.
5. Open the tools picker and enable the **playwright** tools. If prompted, trust/start the server.
6. Ask the agent to inspect one of the site URLs listed above.

## Suggested first check

Ask the agent:

```text
Open https://toxinhub.github.io/tcopy/ in the browser.
Inspect the page at desktop width and then at a mobile viewport.
Report console errors, failed network requests, horizontal overflow, and any obvious layout problems.
Do not modify files.
```

Repeat for CineTon and m}note.

## Important boundaries

- This MCP server is configured for the VS Code/Copilot agent running inside the Codespace. It does **not** attach Playwright MCP to the current ChatGPT conversation.
- To discuss findings here, copy the report or attach screenshots from the Codespace.
- Use test accounts only. Do not paste passwords, API keys, service-role keys, or other secrets into prompts or repository files.
- The browser is configured headless for the cloud Codespace environment.
- Review the MCP server's permissions and approve browser actions deliberately.
