const messages = document.querySelector("#messages");
const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const statusEl = document.querySelector("#status");
const imageUpload = document.querySelector("#image-upload");
const uploadPreview = document.querySelector("#upload-preview");
const sourcesDialog = document.querySelector("#sources-dialog");
const sourcesList = document.querySelector("#sources-list");
const closeSources = document.querySelector("#close-sources");

let uploadedImages = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function addMessage(role, text, sources = []) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const speaker = document.createElement("div");
  speaker.className = "speaker";
  speaker.textContent = role === "user" ? "You" : "LowFrame AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "ai") {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = text;
  }

  if (sources.length) {
    const sourceButton = document.createElement("button");
    sourceButton.className = "source-link";
    sourceButton.type = "button";
    sourceButton.textContent = "Sources";
    sourceButton.addEventListener("click", () => showSources(sources));
    bubble.append(" ");
    bubble.append(sourceButton);
  }

  addCopyButtons(bubble);
  article.append(speaker, bubble);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

function showSources(sources) {
  sourcesList.innerHTML = "";
  for (const [index, source] of sources.entries()) {
    const item = document.createElement("a");
    item.className = "source-item";
    item.href = source.url;
    item.target = "_blank";
    item.rel = "noreferrer";
    item.innerHTML = `<strong>${index + 1}. ${escapeHtml(source.title)}</strong><span>${escapeHtml(source.snippet || source.url)}</span>`;
    sourcesList.append(item);
  }
  sourcesDialog.showModal();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(markdown) {
  const parts = String(markdown).split(/```([\w+-]*)\n?([\s\S]*?)```/g);
  let html = "";

  for (let index = 0; index < parts.length; index += 3) {
    html += renderMarkdownText(parts[index] || "");
    if (index + 2 < parts.length) {
      const language = escapeHtml(parts[index + 1] || "code");
      const code = escapeHtml(parts[index + 2] || "");
      html += `<pre class="code-block"><div class="code-lang">${language}</div><code>${code}</code></pre>`;
    }
  }

  return html;
}

function renderMarkdownText(text) {
  const lines = text.split(/\n/);
  const output = [];
  let listOpen = false;

  for (const line of lines) {
    if (!line.trim()) {
      if (listOpen) {
        output.push("</ul>");
        listOpen = false;
      }
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }

    if (listOpen) {
      output.push("</ul>");
      listOpen = false;
    }
    output.push(`<p>${renderInline(line)}</p>`);
  }

  if (listOpen) output.push("</ul>");
  return output.join("");
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
}

function addCopyButtons(container) {
  for (const block of container.querySelectorAll(".code-block")) {
    const button = document.createElement("button");
    button.className = "copy-code";
    button.type = "button";
    button.textContent = "Copy";
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(block.querySelector("code")?.textContent || "");
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = "Copy";
      }, 1200);
    });
    block.append(button);
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message && !uploadedImages.length) return;

  messageInput.value = "";
  addMessage("user", message || "Uploaded image");

  setStatus("Thinking");
  try {
    const response = await staticAnswer(message, uploadedImages);
    addMessage("ai", response.answer, response.sources || []);
    clearUploads();
    setStatus("Ready");
  } catch (error) {
    addMessage("ai", `Error: ${error.message}`);
    setStatus("Error");
  }
});

messageInput.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") {
    chatForm.requestSubmit();
  }
});

imageUpload.addEventListener("change", async () => {
  const files = Array.from(imageUpload.files || []);
  uploadedImages = [];
  uploadPreview.innerHTML = "";
  setStatus("Reading images");

  try {
    for (const file of files.slice(0, 3)) {
      const image = await readImageFile(file);
      uploadedImages.push(image);
      addUploadPreview(image);
    }
    setStatus(uploadedImages.length ? `${uploadedImages.length} image ready` : "Ready");
  } catch (error) {
    setStatus("Image upload error");
    addMessage("ai", `Image upload error: ${error.message}`);
  }
});

async function staticAnswer(message, images) {
  if (images.length) {
    return { answer: imageMetadataAnswer(images) };
  }

  const math = solveMath(message);
  if (math !== null) {
    return { answer: math };
  }

  if (isCodeRequest(message)) {
    return { answer: codeAnswer(message) };
  }

  const known = knownStaticAnswer(message);
  if (known) {
    return known;
  }

  return lookupAnswer(message);
}

function knownStaticAnswer(message) {
  const lower = message.toLowerCase();
  if (
    lower.includes("jdk") &&
    lower.includes("lts") &&
    (lower.includes("release") || lower.includes("version") || lower.includes("all"))
  ) {
    return {
      answer: "The answer: the commonly used LTS JDK releases are JDK 8, JDK 11, JDK 17, JDK 21, and JDK 25. JDK 25 is the latest LTS JDK release, while JDK 26 is a newer non-LTS feature release.",
      sources: [
        {
          title: "Oracle Java Downloads",
          url: "https://www.oracle.com/java/technologies/downloads/",
          snippet: "Oracle lists JDK 25 as the latest Long-Term Support release and JDK 21 as the previous LTS release.",
        },
        {
          title: "BellSoft Liberica JDK downloads",
          url: "https://bell-sw.com/pages/downloads/",
          snippet: "BellSoft lists JDK 8, 11, 17, 21, and 25 as LTS versions.",
        },
      ],
    };
  }
  return null;
}

function imageMetadataAnswer(images) {
  return [
    "I can inspect the uploaded image metadata in static mode:",
    ...images.map((image, index) => (
      `${index + 1}. ${image.name}: ${image.type}, ${image.width}x${image.height}, ${image.size} bytes, average color ${image.averageColor}`
    )),
    "Static GitHub Pages cannot run private vision models. For real image understanding, use a hosted backend or a browser-side vision API with your own key.",
  ].join("\n");
}

async function lookupAnswer(message) {
  const query = cleanLookupQuery(message);
  const results = await Promise.allSettled([
    duckDuckGoLookup(query),
    wikipediaLookup(query),
    wikidataLookup(query),
  ]);
  const candidates = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value || [])
    .filter((candidate) => candidate.answer);

  if (candidates.length) {
    candidates.sort((a, b) => scoreCandidate(query, b) - scoreCandidate(query, a));
    const best = candidates[0];
    const sources = candidates.slice(0, 5).map((candidate) => candidate.source);
    return { answer: best.answer, sources };
  }

  return {
    answer: `I could not find a solid public lookup result for "${query}". Try asking with a more specific name or phrase.`,
    sources: [],
  };
}

async function duckDuckGoLookup(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("DuckDuckGo lookup failed");
  const data = await response.json();
  const candidates = [];
  const text = data.AbstractText || data.Answer || "";
  if (text) {
    candidates.push({
      answer: `The answer: ${text}`,
      text,
      source: { title: data.Heading || "DuckDuckGo", url: data.AbstractURL || url, snippet: text },
    });
  }
  for (const topic of flattenRelatedTopics(data.RelatedTopics || [])) {
    if (topic.Text && topic.FirstURL) {
      candidates.push({
        answer: `The answer: ${topic.Text}`,
        text: topic.Text,
        source: { title: topic.Text.split(" - ")[0], url: topic.FirstURL, snippet: topic.Text },
      });
    }
  }
  return candidates;
}

async function wikipediaLookup(query) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`;
  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) throw new Error("Wikipedia search failed");
  const search = await searchResponse.json();
  const titles = search[1] || [];
  if (!titles.length) return [];

  const summaries = await Promise.allSettled(titles.map(async (title) => {
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryResponse = await fetch(summaryUrl);
    if (!summaryResponse.ok) throw new Error("Wikipedia summary failed");
    return summaryResponse.json();
  }));

  return summaries
    .filter((result) => result.status === "fulfilled" && result.value.extract)
    .map((result) => ({
      answer: `The answer: ${result.value.extract}`,
      text: `${result.value.title} ${result.value.extract}`,
      source: {
        title: result.value.title,
        url: result.value.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(result.value.title)}`,
        snippet: result.value.extract,
      },
    }));
}

async function wikidataLookup(query) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&origin=*&limit=5`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Wikidata lookup failed");
  const data = await response.json();
  return (data.search || [])
    .filter((item) => item.label && item.description)
    .map((item) => {
      const text = `${item.label}: ${item.description}`;
      return {
        answer: `The answer: ${text}.`,
        text,
        source: {
          title: item.label,
          url: item.concepturi || `https://www.wikidata.org/wiki/${item.id}`,
          snippet: item.description,
        },
      };
    });
}

function flattenRelatedTopics(topics) {
  return topics.flatMap((topic) => topic.Topics ? flattenRelatedTopics(topic.Topics) : [topic]);
}

function scoreCandidate(query, candidate) {
  const queryWords = keywords(query);
  const textWords = new Set(keywords(candidate.text || candidate.answer));
  const overlap = queryWords.filter((word) => textWords.has(word)).length;
  const sourceBonus = candidate.source.url.includes("wikipedia.org") ? 1 : 0;
  const lengthBonus = Math.min((candidate.text || "").length / 400, 1);
  return overlap * 3 + sourceBonus + lengthBonus;
}

function keywords(text) {
  const stop = new Set(["the", "and", "for", "you", "that", "this", "with", "what", "when", "where", "who", "are", "is", "of", "a", "an", "to", "in"]);
  return String(text).toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => !stop.has(word)) || [];
}

function cleanLookupQuery(message) {
  return message
    .replace(/^(look up|search for|search|what is|what are|who is|who are|tell me about)\s+/i, "")
    .trim() || message.trim();
}

function solveMath(message) {
  let expression = message.toLowerCase().trim();
  expression = expression.replace(/^(what is|calculate|solve)\s+/i, "").replace(/\?$/, "");
  expression = expression.replaceAll("plus", "+").replaceAll("minus", "-");
  expression = expression.replaceAll("times", "*").replaceAll("divided by", "/").replaceAll("^", "**");
  if (!/^[0-9+\-*/%().,\s]+$/.test(expression)) return null;
  try {
    const result = Function(`"use strict"; return (${expression})`)();
    return Number.isFinite(result) ? String(result) : null;
  } catch {
    return null;
  }
}

function isCodeRequest(message) {
  return /\b(code|program|script|function|app|java|python|javascript|c\+\+|cpp)\b/i.test(message);
}

function codeAnswer(message) {
  const language = codeLanguage(message);
  const topic = message
    .replace(/^(please|can you|make me|make|build me|build|create|write|give me)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();
  const code = codeFor(language, message);
  const fence = language === "C++" ? "cpp" : language.toLowerCase();
  const run = {
    Java: "javac Main.java && java Main",
    Python: "python3 app.py",
    JavaScript: "node app.js",
    "C++": "g++ main.cpp -o main && ./main",
  }[language];
  return `Here is runnable ${language} for \`${topic}\`:\n\n\`\`\`${fence}\n${code}\n\`\`\`\n\nRun it with \`${run}\`.`;
}

function codeLanguage(message) {
  const lower = message.toLowerCase();
  if (lower.includes("java") && !lower.includes("javascript")) return "Java";
  if (lower.includes("javascript") || /\bjs\b/.test(lower)) return "JavaScript";
  if (lower.includes("c++") || lower.includes("cpp")) return "C++";
  return "Python";
}

function quotedText(message) {
  const match = message.match(/"([^"]+)"|'([^']+)'/);
  return match ? (match[1] || match[2]) : "";
}

function codeFor(language, message) {
  const lower = message.toLowerCase();
  if (language === "Java") return javaCode(message);
  if (language === "JavaScript") return jsCode(message);
  if (language === "C++") return cppCode(message);
  if (/rock\s+paper\s+(scissors|siscors)/i.test(lower)) return pythonRps();
  if (lower.includes("todo")) return pythonTodo();
  if (lower.includes("calculator")) return pythonCalculator();
  const text = quotedText(message);
  if (text) return `print(${JSON.stringify(text)})`;
  return `name = input("Enter your name: ")\nprint(f"Hello, {name}!")`;
}

function javaCode(message) {
  const lower = message.toLowerCase();
  if (/rock\s+paper\s+(scissors|siscors)/i.test(lower)) return javaRps();
  if (lower.includes("todo")) return javaTodo();
  if (lower.includes("calculator")) return javaCalculator();
  const text = quotedText(message) || "Hello World";
  return `public class Main {\n    public static void main(String[] args) {\n        System.out.println(${JSON.stringify(text)});\n    }\n}`;
}

function javaRps() {
  return `import java.util.Random;\nimport java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        String[] choices = {"rock", "paper", "scissors"};\n        String computer = choices[new Random().nextInt(choices.length)];\n\n        System.out.print("Choose rock, paper, or scissors: ");\n        String player = scanner.nextLine().trim().toLowerCase();\n\n        if (!player.equals("rock") && !player.equals("paper") && !player.equals("scissors")) {\n            System.out.println("Invalid choice.");\n        } else if (player.equals(computer)) {\n            System.out.println("Computer chose: " + computer + ". Tie!");\n        } else if ((player.equals("rock") && computer.equals("scissors")) ||\n                   (player.equals("paper") && computer.equals("rock")) ||\n                   (player.equals("scissors") && computer.equals("paper"))) {\n            System.out.println("Computer chose: " + computer + ". You win!");\n        } else {\n            System.out.println("Computer chose: " + computer + ". You lose!");\n        }\n\n        scanner.close();\n    }\n}`;
}

function javaCalculator() {
  return `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        System.out.print("First number: ");\n        double a = scanner.nextDouble();\n        System.out.print("Operator (+, -, *, /): ");\n        String op = scanner.next();\n        System.out.print("Second number: ");\n        double b = scanner.nextDouble();\n\n        switch (op) {\n            case "+" -> System.out.println(a + b);\n            case "-" -> System.out.println(a - b);\n            case "*" -> System.out.println(a * b);\n            case "/" -> System.out.println(b == 0 ? "Cannot divide by zero." : a / b);\n            default -> System.out.println("Unknown operator.");\n        }\n        scanner.close();\n    }\n}`;
}

function javaTodo() {
  return `import java.util.ArrayList;\nimport java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        ArrayList<String> tasks = new ArrayList<>();\n\n        while (true) {\n            System.out.println("\\n1. Show tasks\\n2. Add task\\n3. Quit");\n            String choice = scanner.nextLine();\n            if (choice.equals("1")) {\n                for (int i = 0; i < tasks.size(); i++) System.out.println((i + 1) + ". " + tasks.get(i));\n            } else if (choice.equals("2")) {\n                System.out.print("Task: ");\n                tasks.add(scanner.nextLine());\n            } else if (choice.equals("3")) {\n                break;\n            }\n        }\n        scanner.close();\n    }\n}`;
}

function jsCode(message) {
  const text = quotedText(message) || "Hello World";
  return `console.log(${JSON.stringify(text)});`;
}

function cppCode(message) {
  const text = quotedText(message) || "Hello World";
  return `#include <iostream>\n\nint main() {\n    std::cout << ${JSON.stringify(text)} << std::endl;\n    return 0;\n}`;
}

function pythonRps() {
  return `import random\n\nchoices = ["rock", "paper", "scissors"]\nplayer = input("Choose rock, paper, or scissors: ").strip().lower()\ncomputer = random.choice(choices)\n\nif player not in choices:\n    print("Invalid choice.")\nelif player == computer:\n    print(f"Computer chose {computer}. Tie!")\nelif (player == "rock" and computer == "scissors") or (player == "paper" and computer == "rock") or (player == "scissors" and computer == "paper"):\n    print(f"Computer chose {computer}. You win!")\nelse:\n    print(f"Computer chose {computer}. You lose!")`;
}

function pythonCalculator() {
  return `expression = input("Expression: ")\nallowed = set("0123456789+-*/%(). ")\nif any(char not in allowed for char in expression):\n    print("Invalid expression.")\nelse:\n    print(eval(expression, {"__builtins__": {}}, {}))`;
}

function pythonTodo() {
  return `tasks = []\n\nwhile True:\n    print("\\n1. Show tasks\\n2. Add task\\n3. Quit")\n    choice = input("> ")\n    if choice == "1":\n        for i, task in enumerate(tasks, 1):\n            print(f"{i}. {task}")\n    elif choice == "2":\n        tasks.append(input("Task: "))\n    elif choice == "3":\n        break`;
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const dataUrl = reader.result;
      const image = new Image();
      image.onload = () => resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        width: image.naturalWidth,
        height: image.naturalHeight,
        averageColor: averageColor(image),
        dataUrl,
      });
      image.onerror = () => reject(new Error(`Could not decode ${file.name}`));
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function averageColor(image) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, 32, 32);
  const pixels = context.getImageData(0, 0, 32, 32).data;
  let red = 0, green = 0, blue = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    red += pixels[i] * alpha;
    green += pixels[i + 1] * alpha;
    blue += pixels[i + 2] * alpha;
    count += alpha;
  }
  if (!count) return "transparent";
  const r = Math.round(red / count).toString(16).padStart(2, "0");
  const g = Math.round(green / count).toString(16).padStart(2, "0");
  const b = Math.round(blue / count).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function addUploadPreview(image) {
  const item = document.createElement("div");
  item.className = "upload-chip";
  const thumb = document.createElement("img");
  thumb.src = image.dataUrl;
  thumb.alt = image.name;
  const label = document.createElement("span");
  label.textContent = `${image.name} (${image.width}x${image.height})`;
  item.append(thumb, label);
  uploadPreview.append(item);
}

function clearUploads() {
  uploadedImages = [];
  imageUpload.value = "";
  uploadPreview.innerHTML = "";
}

closeSources.addEventListener("click", () => sourcesDialog.close());
