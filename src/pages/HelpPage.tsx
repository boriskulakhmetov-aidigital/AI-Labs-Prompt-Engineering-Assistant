import { useEffect } from 'react';
import { HelpPage, applyTheme, resolveTheme } from '@boriskulakhmetov-aidigital/design-system';
import '@boriskulakhmetov-aidigital/design-system/style.css';

const GUIDE = `# Prompt Engineering Assistant — User Guide

**Tool:** [Prompt Engineering Assistant](https://promptengineer.apps.aidigitallabs.com)

The Prompt Engineering Assistant helps you craft, test, and refine AI prompts. Whether you're building prompts for ChatGPT, Gemini, Claude, or any other AI tool, this assistant ensures your prompts are clear, consistent, and optimized for the best results.

---

## Getting Started

### 1. Sign In

Open the app and sign in with your AIDigital Labs account.

![Landing page after sign-in](/guide/prompt-engineering-01-landing.png)

### 2. Describe the Prompt You Need

You can either provide a **complete prompt** for testing, or **describe what you need** and let the AI design one for you. For example:

- "I need a prompt that generates product descriptions for e-commerce"
- "Help me write a prompt for summarizing customer feedback"
- "Create a prompt that writes social media captions in our brand voice"
- Or paste an existing prompt: "Test this prompt: [your prompt here]"

### 3. Answer Follow-Up Questions

The AI will ask clarifying questions to understand exactly what you need:

- What tone should the output have?
- How long should the output be?
- Are there any constraints or required elements?
- Can you share an example of a good output?

> **Tip:** The more examples and context you provide, the better the engineered prompt will be.

![AI conversation with follow-up questions](/guide/prompt-engineering-02-conversation.png)

### 4. Watch the Pipeline Run

Once the AI has enough context, it runs an automated pipeline:

1. **Prompt Design** — the AI crafts a structured, optimized prompt
2. **Test Input Generation** — sample inputs are created to test the prompt
3. **Test Iterations** — the prompt is run 3 times to verify consistency

This pipeline is fast — it typically completes in **under 2 minutes**.

![Pipeline dispatched and running](/guide/prompt-engineering-03-pipeline.png)

### 5. Review the Results

You will see:

- **The engineered prompt** — ready to copy and use
- **Test run results** — 3 sample outputs showing how the prompt performs
- **A "Re-run" button** — click to iterate and generate new test results

![Pipeline results with test runs](/guide/prompt-engineering-04-results.png)

### 6. Download or Iterate

- **Copy** the prompt directly from the interface
- **Re-run** to see additional test iterations
- **Download as Markdown or PDF** for documentation

![Final results with download options](/guide/prompt-engineering-05-final.png)

---

## What to Expect

| Step | Time |
|------|------|
| Describe what you need (or paste a prompt) | 1 minute |
| AI follow-up questions | 0–1 minutes |
| Pipeline: design + test input + 3 test runs | ~90 seconds |
| **Total** | **Under 2 minutes** |

> This is the fastest tool in the suite. Most sessions complete in under 2 minutes.

---

## Tips

- **Start with the end in mind.** Before you begin, think about what a perfect output looks like. Share that vision with the AI.

- **Iterate freely.** If the first version isn't quite right, tell the AI what to adjust. "Make the tone more formal" or "Add a section for pricing" — the AI refines on the fly.

- **Test across models.** A prompt that works well in ChatGPT might need tweaks for Gemini. Mention which AI you're targeting.

- **Save for later.** Your sessions are preserved automatically, so you can revisit and refine prompts anytime.

- **Use dark mode** if you prefer a darker interface. Click the theme toggle in the top-right corner.

![Dark Mode](/guide/prompt-engineering-dark.png)

---

## Your Past Sessions

Every session is saved automatically. Use the sidebar to browse your previous prompt engineering sessions.

![Session History](/guide/prompt-engineering-sidebar.png)
`;

export default function AppHelpPage() {
  useEffect(() => { applyTheme(resolveTheme()); }, []);
  return <HelpPage markdown={GUIDE} />;
}
