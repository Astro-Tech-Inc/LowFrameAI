const messages = document.querySelector("#messages");
const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const statusEl = document.querySelector("#status");
const imageUpload = document.querySelector("#image-upload");
const uploadPreview = document.querySelector("#upload-preview");
const sendButton = document.querySelector("#send-button");
const sourcesDialog = document.querySelector("#sources-dialog");
const sourcesList = document.querySelector("#sources-list");
const closeSources = document.querySelector("#close-sources");

const LOWFRAME_MEMORY_KEY = "lowframe_temp_memory_v1";
const LOWFRAME_MEMORY_LIMIT = 12;
const API_TIMEOUT_MS = 7000;
const IMAGE_API_URL = "https://imagegen.897mmo0216.workers.dev/";
const DEPLOYED_MEDIA_API_URL = "https://lowframe-media.897mmo0216.workers.dev/";
const LOCAL_MEDIA_API_URL = "http://127.0.0.1:8787/";
const MEDIA_API_URL = isLocalHost() ? LOCAL_MEDIA_API_URL : DEPLOYED_MEDIA_API_URL;
const IMAGE_TIMEOUT_MS = 60000;
const UPLOAD_TIMEOUT_MS = 20000;
const VISION_TIMEOUT_MS = 60000;
const FETCH_IMAGE_TIMEOUT_MS = 12000;

let uploadedImages = [];
let tempMemory = loadTempMemory();

function setStatus(text) {
  statusEl.textContent = text;
}

function isLocalHost() {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
}

function setBusy(isBusy, label = "Send") {
  sendButton.disabled = isBusy;
  sendButton.textContent = label;
  messageInput.disabled = isBusy;
}

function selectedMode() {
  return document.querySelector('input[name="response-mode"]:checked')?.value || "chat";
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

function addImageMessage(prompt, imageUrl) {
  const article = document.createElement("article");
  article.className = "message ai";

  const speaker = document.createElement("div");
  speaker.className = "speaker";
  speaker.textContent = "LowFrame AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble image-bubble";

  const image = document.createElement("img");
  image.className = "generated-image";
  image.src = imageUrl;
  image.alt = prompt;

  const caption = document.createElement("div");
  caption.className = "image-caption";
  caption.textContent = prompt;

  const actions = document.createElement("div");
  actions.className = "image-actions";

  const openLink = document.createElement("a");
  openLink.href = imageUrl;
  openLink.target = "_blank";
  openLink.rel = "noreferrer";
  openLink.textContent = "Open";

  const downloadLink = document.createElement("a");
  downloadLink.href = imageUrl;
  downloadLink.download = "lowframe-image.png";
  downloadLink.textContent = "Download";

  actions.append(openLink, downloadLink);
  bubble.append(image, caption, actions);
  article.append(speaker, bubble);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

function addFetchedImagesMessage(query, images) {
  const article = document.createElement("article");
  article.className = "message ai";

  const speaker = document.createElement("div");
  speaker.className = "speaker";
  speaker.textContent = "LowFrame AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble image-bubble";

  const caption = document.createElement("div");
  caption.className = "image-caption";
  caption.textContent = images.length
    ? `Fetched ${images.length} public image${images.length === 1 ? "" : "s"} for ${query}.`
    : `I could not find public images for ${query}.`;

  const grid = document.createElement("div");
  grid.className = "fetch-grid";

  for (const item of images) {
    const card = document.createElement("a");
    card.className = "fetch-card";
    card.href = item.pageUrl || item.imageUrl;
    card.target = "_blank";
    card.rel = "noreferrer";

    const image = document.createElement("img");
    image.src = item.thumbnail || item.imageUrl;
    image.alt = item.title || query;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";

    const title = document.createElement("span");
    title.textContent = item.title || item.source || "Image";

    const source = document.createElement("small");
    source.textContent = [item.source, item.creator].filter(Boolean).join(" - ");

    card.append(image, title, source);
    grid.append(card);
  }

  const sources = document.createElement("div");
  sources.className = "image-actions";
  for (const item of images.slice(0, 6)) {
    const link = document.createElement("a");
    link.href = item.pageUrl || item.imageUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = item.source || "Source";
    sources.append(link);
  }

  bubble.append(caption, grid);
  if (images.length) bubble.append(sources);
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

  const shouldFetchImages = selectedMode() === "fetch" || isImageFetchRequest(message);
  if (shouldFetchImages) {
    if (!message) {
      addMessage("ai", "Tell me what images to fetch.");
      return;
    }

    setStatus("Fetching images");
    setBusy(true, "Fetching");
    try {
      const query = cleanImageFetchPrompt(message);
      const images = await fetchPublicImages(query);
      addFetchedImagesMessage(query, images);
      clearUploads();
      setStatus("Ready");
    } catch (error) {
      addMessage("ai", `Image fetch error: ${error.message}`);
      setStatus("Error");
    } finally {
      setBusy(false);
    }
    return;
  }

  const shouldGenerateImage = selectedMode() === "image" || isImageGenerationRequest(message);
  if (shouldGenerateImage) {
    if (!message) {
      addMessage("ai", "Give me a prompt for the image you want.");
      return;
    }

    setStatus("Generating image");
    setBusy(true, "Generating");
    try {
      const imageUrl = await generateImage(cleanImagePrompt(message));
      addImageMessage(cleanImagePrompt(message), imageUrl);
      clearUploads();
      setStatus("Ready");
    } catch (error) {
      addMessage("ai", `Image generation error: ${error.message}`);
      setStatus("Error");
    } finally {
      setBusy(false);
    }
    return;
  }

  setStatus("Thinking");
  setBusy(true, "Thinking");
  try {
    const response = await staticAnswer(message, uploadedImages);
    addMessage("ai", response.answer, response.sources || []);
    rememberTurn(message, response);
    clearUploads();
    setStatus("Ready");
  } catch (error) {
    addMessage("ai", `Error: ${error.message}`);
    setStatus("Error");
  } finally {
    setBusy(false);
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
      setStatus(`Uploading ${image.name}`);
      image.hosted = await uploadImageFile(file).catch(() => null);
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
    return visionAnswer(message, images).catch((error) => ({
      answer: `I can see the upload, but the vision check failed: ${error.message}\n\n${imageMetadataAnswer(images)}`,
    }));
  }

  const correction = await correctionAnswer(message);
  if (correction) {
    return correction;
  }

  const greeting = greetingAnswer(message);
  if (greeting) {
    return { answer: greeting };
  }

  const math = solveMath(message);
  if (math !== null) {
    return { answer: math };
  }

  const contextMath = solveContextMath(message);
  if (contextMath !== null) {
    return { answer: contextMath };
  }

  if (isCodeRequest(message)) {
    return { answer: codeAnswer(message) };
  }

  const known = knownStaticAnswer(message);
  if (known) {
    return known;
  }

  const direct = await directApiAnswer(message);
  if (direct) {
    return direct;
  }

  return lookupAnswer(message);
}

function knownStaticAnswer(message) {
  const lower = message.toLowerCase();
  if (isSelfQuestion(lower)) {
    return {
      answer: selfAnswer(lower),
      sources: [],
    };
  }

  if (isMinecraftPopularityQuestion(lower)) {
    return {
      answer: "There is not one official “everyone liked it most” Minecraft version, but the version people most often talk about as a favorite is Java Edition 1.8.9, especially because of PvP and older server communities. For survival/modded nostalgia, 1.7.10 and 1.12.2 also come up a lot; for modern survival, people often point to 1.16.5 or 1.20.x. So the clean answer is: 1.8.9 is probably the most famous community-favorite, but it depends on whether you mean PvP, mods, or survival.",
      sources: [
        {
          title: "Minecraft Wiki: Java Edition 1.8.9",
          url: "https://minecraft.wiki/w/Java_Edition_1.8.9",
          snippet: "Java Edition 1.8.9 is a well-known older Java release used heavily by legacy PvP communities.",
        },
        {
          title: "Minecraft Wiki: Java Edition version history",
          url: "https://minecraft.wiki/w/Java_Edition_version_history",
          snippet: "Version history gives context for major Java Edition eras and releases.",
        },
      ],
    };
  }

  if (
    lower.includes("jdk") &&
    lower.includes("lts") &&
    (lower.includes("release") || lower.includes("version") || lower.includes("all"))
  ) {
    return {
      answer: "The commonly used LTS JDK releases are JDK 8, JDK 11, JDK 17, JDK 21, and JDK 25. JDK 25 is the latest LTS JDK release, while JDK 26 is a newer non-LTS feature release.",
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

function isSelfQuestion(lower) {
  return (
    /\b(you|your|yourself|lowframe|nova)\b/.test(lower) &&
    /\b(who|what|why|how|are|can|could|best|better|name|made|built|do|help)\b/.test(lower)
  ) || (
    /\b(ai|assistant|chatbot|bot)\b/.test(lower) &&
    /\b(you|your|best|better|why|what can|who are)\b/.test(lower)
  );
}

function selfAnswer(lower) {
  if (/\b(best|better)\b/.test(lower)) {
    return "I am LowFrame AI. I would not call myself the best AI, but I am built to be useful here: answer plainly, search when facts matter, write code, remember the recent chat during this session, and admit when a result looks weak.";
  }
  if (/\b(who are|what are|name)\b/.test(lower)) {
    return "I am LowFrame AI, the assistant built into this project. I can help answer questions, search public sources, write code, explain errors, and work with the browser/sidebar setup.";
  }
  if (/\b(can|could|do|help)\b/.test(lower)) {
    return "I can answer questions, look things up, write and debug code, explain errors, compare options, and keep track of the recent conversation while this page is open.";
  }
  return "I am LowFrame AI. I answer directly when I know enough, search public sources when facts matter, and try not to pretend when the match is weak.";
}

function greetingAnswer(message) {
  return /^\s*(hi|hello|hey|yo|sup|greetings)\s*[!.?]*\s*$/i.test(message) ? "Hi. What are we working on?" : "";
}

function isImageGenerationRequest(message) {
  return /^\s*(generate|create|make|draw|render)\s+(an?\s+)?(image|picture|photo|art|wallpaper|logo|icon|scene)\b/i.test(message);
}

function isImageFetchRequest(message) {
  return /^\s*(fetch|find|get|search)\s+(images?|pictures?|photos?)\s+(of|for)?\s+/i.test(message) ||
    /^\s*(fetch|find|get|search)\s+.+\s+(images?|pictures?|photos?)\s*$/i.test(message);
}

function cleanImagePrompt(message) {
  return String(message)
    .replace(/^\s*(generate|create|make|draw|render)\s+(an?\s+)?(image|picture|photo|art|wallpaper|logo|icon|scene)\s*(of|for|showing)?\s*/i, "")
    .trim() || message.trim();
}

function cleanImageFetchPrompt(message) {
  return String(message)
    .replace(/^\s*(fetch|find|get|search)\s+(images?|pictures?|photos?)\s+(of|for)?\s*/i, "")
    .replace(/^\s*(fetch|find|get|search)\s*/i, "")
    .replace(/\s+(images?|pictures?|photos?)\s*$/i, "")
    .trim() || message.trim();
}

async function generateImage(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(IMAGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        model: "flux-klein",
        size: "768x768",
        quality: "balanced",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await imageWorkerError(response);
      throw new Error(message || `Worker returned ${response.status}`);
    }

    return imageResponseUrl(response);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Image generation timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPublicImages(query) {
  const providers = [
    wikipediaLeadImageLookup(query),
    wikimediaCommonsImageLookup(query),
    openverseImageLookup(query),
  ].map((task) => withTimeout(task, FETCH_IMAGE_TIMEOUT_MS));

  const results = await Promise.allSettled(providers);
  const images = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value || [])
    .filter((item) => item.imageUrl || item.thumbnail);

  return uniqueFetchedImages(images).slice(0, 12);
}

async function wikipediaLeadImageLookup(query) {
  const title = await wikipediaBestTitle(query);
  if (!title) return [];

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const data = await fetchJson(url);
  const imageUrl = data?.originalimage?.source || data?.thumbnail?.source;
  if (!imageUrl) return [];

  return [{
    title: data.title || title,
    imageUrl,
    thumbnail: data.thumbnail?.source || imageUrl,
    pageUrl: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    creator: "",
    source: "Wikipedia",
  }];
}

async function wikipediaBestTitle(query) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&origin=*`;
  const data = await fetchJson(url);
  return data?.[1]?.[0] || "";
}

async function wikimediaCommonsImageLookup(query) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "10",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "520",
    format: "json",
    origin: "*",
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params}`;
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages || {});

  return pages
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info?.url || !String(info.mime || "").startsWith("image/")) return null;
      return {
        title: cleanCommonsTitle(page.title),
        imageUrl: info.url,
        thumbnail: info.thumburl || info.url,
        pageUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
        creator: stripHtml(info.extmetadata?.Artist?.value || ""),
        source: "Wikimedia Commons",
      };
    })
    .filter(Boolean);
}

async function openverseImageLookup(query) {
  const params = new URLSearchParams({
    q: query,
    page_size: "10",
    mature: "false",
  });
  const url = `https://api.openverse.org/v1/images/?${params}`;
  const data = await fetchJson(url);
  return (data?.results || [])
    .filter((item) => item.url)
    .map((item) => ({
      title: item.title || query,
      imageUrl: item.url,
      thumbnail: item.thumbnail || item.url,
      pageUrl: item.foreign_landing_url || item.url,
      creator: item.creator || "",
      source: `Openverse${item.provider ? ` / ${item.provider}` : ""}`,
    }));
}

function uniqueFetchedImages(images) {
  const seen = new Set();
  return images.filter((item) => {
    const key = item.imageUrl || item.thumbnail;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanCommonsTitle(title) {
  return String(title || "")
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_/g, " ");
}

async function uploadImageFile(file) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append("file", file, file.name);
    const response = await fetch(new URL("upload", MEDIA_API_URL).toString(), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.url ? data : null;
  } finally {
    clearTimeout(timer);
  }
}

async function visionAnswer(message, images) {
  const answers = [];
  const sources = [];

  for (const [index, image] of images.entries()) {
    const response = await analyzeUploadedImage(image, message, index, images.length);
    answers.push(response.answer);
    if (image.hosted?.url) {
      sources.push({ title: image.name, url: image.hosted.url });
    }
  }

  return {
    answer: answers.join("\n\n"),
    sources,
  };
}

async function analyzeUploadedImage(image, message, index, total) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const prompt = imageVisionPrompt(message, image, index, total);
    const response = await fetch(new URL("vision", MEDIA_API_URL).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        image: image.dataUrl,
        name: image.name,
        type: image.type,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await imageWorkerError(response);
      throw new Error(message || `Vision Worker returned ${response.status}`);
    }

    const data = await response.json();
    if (!data.answer) throw new Error("Vision Worker did not return an answer.");
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Image vision timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function imageVisionPrompt(message, image, index, total) {
  const clean = String(message || "").trim();
  const prefix = total > 1 ? `Image ${index + 1} of ${total}, ${image.name}. ` : `${image.name}. `;
  const request = clean || "What is this image? Identify the main subject and any important visible details.";
  return `${prefix}${request}\nAnswer in your own words. Be direct, useful, and mention uncertainty when the image is unclear.`;
}

async function imageResponseUrl(response) {
  const contentType = response.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (data.dataURI) return dataUriToObjectUrl(data.dataURI);
    if (data.image) return base64ImageToObjectUrl(data.image, data.mimeType || "image/jpeg");
    throw new Error(data.error || "Worker returned JSON without an image.");
  }

  const buffer = await response.arrayBuffer();
  if (isValidImageBuffer(buffer)) {
    return URL.createObjectURL(new Blob([buffer], { type: contentType.startsWith("image/") ? contentType : imageMimeType(buffer) }));
  }

  const text = new TextDecoder().decode(buffer).trim();
  if (text === "[object Object]") {
    throw new Error("The Worker returned a JavaScript object as image bytes. Update the Worker to decode response.image from base64 before returning it.");
  }

  try {
    const data = JSON.parse(text);
    if (data.dataURI) return dataUriToObjectUrl(data.dataURI);
    if (data.image) return base64ImageToObjectUrl(data.image, data.mimeType || "image/jpeg");
    throw new Error(data.error || "Worker did not return an image.");
  } catch {
    throw new Error(text || "Worker did not return a valid image.");
  }
}

function isValidImageBuffer(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return png || jpeg || webp;
}

function imageMimeType(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x52 && bytes[8] === 0x57) return "image/webp";
  return "application/octet-stream";
}

function dataUriToObjectUrl(dataUri) {
  const match = String(dataUri).match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/);
  if (!match) throw new Error("Worker returned an invalid data URI.");
  return base64ImageToObjectUrl(match[2], match[1]);
}

function base64ImageToObjectUrl(base64, mimeType) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

async function imageWorkerError(response) {
  const text = await response.text();
  if (!text) return "";

  try {
    return friendlyWorkerError(JSON.parse(text).error || text);
  } catch {
    return friendlyWorkerError(text);
  }
}

function friendlyWorkerError(text) {
  const message = String(text || "");
  if (message.includes("5016") && message.toLowerCase().includes("agree")) {
    return "Cloudflare needs a one-time vision model license agreement before image understanding works. Run: curl -X POST http://127.0.0.1:8787/vision/agree";
  }
  if (message.includes("5028") && message.toLowerCase().includes("deprecated")) {
    return "That Cloudflare vision model is deprecated. Deploy the updated lowframe-media-worker files.";
  }
  return message;
}

function imageMetadataAnswer(images) {
  return [
    "I can inspect the uploaded image metadata in static mode:",
    ...images.map((image, index) => (
      `${index + 1}. ${image.name}: ${image.type}, ${image.width}x${image.height}, ${image.size} bytes, average color ${image.averageColor}${image.hosted?.url ? `. Hosted URL: ${image.hosted.url}` : ""}`
    )),
    "Static GitHub Pages cannot run private vision models. The hosted URL lets your Worker or another backend read the image later without keeping your PC on.",
  ].join("\n");
}

async function correctionAnswer(message) {
  const last = lastMemory();
  const address = extractServerAddress(message);
  if (address && last?.intent === "minecraft_server") {
    const result = await minecraftServerStatusLookup(`ping minecraft server ${address}`);
    if (!result.length) return null;
    const candidate = result[0];
    return {
      answer: `Good catch. I read the server address as ${address} now. ${friendlyServerAnswer(candidate.answer)}`,
      sources: [candidate.source],
    };
  }

  const correction = message.match(/^\s*(?:not|no,?|actually)\s+(.{3,})$/i)?.[1];
  if (correction && last?.intent === "minecraft_server") {
    const fixedAddress = extractServerAddress(correction);
    if (fixedAddress) {
      const result = await minecraftServerStatusLookup(`ping minecraft server ${fixedAddress}`);
      if (result.length) {
        return {
          answer: `Got it. I checked ${fixedAddress} instead. ${friendlyServerAnswer(result[0].answer)}`,
          sources: [result[0].source],
        };
      }
    }
  }

  return null;
}

async function directApiAnswer(message) {
  const results = await Promise.allSettled([
    sportsLookup(message),
    minecraftServerStatusLookup(message),
    weatherLookup(message),
    mdnLookup(message),
    tvMazeLookup(message),
    jikanLookup(message),
    pokeLookup(message),
    nominatimLookup(message),
    musicBrainzLookup(message),
    itunesLookup(message),
    openFoodFactsLookup(message),
    gbifLookup(message),
    iNaturalistLookup(message),
    coinGeckoLookup(message),
    worldBankLookup(message),
    universitiesLookup(message),
    dictionaryLookup(message),
    githubLookup(message),
    packageLookup(message),
    countryLookup(message),
    openLibraryLookup(message),
  ].map((task) => withTimeout(task, API_TIMEOUT_MS)));
  const candidates = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value || [])
    .filter((candidate) => candidate.answer);

  if (!candidates.length) return null;
  candidates.sort((a, b) => scoreCandidate(message, b) - scoreCandidate(message, a));
  const best = candidates[0];
  const answer = best.intent === "sports_coach"
    ? best.answer
    : best.source?.url?.includes("mcsrvstat.us")
    ? friendlyServerAnswer(best.answer)
    : composeAnswer(message, best, candidates);
  return {
    answer,
    sources: uniqueSources(candidates.slice(0, 6).map((candidate) => candidate.source)),
  };
}

async function lookupAnswer(message) {
  const queries = lookupQueries(message);
  const mainQuery = queries[0];
  const tasks = [
    mojangMinecraftLookup(mainQuery),
    ...queries.flatMap((query) => [
      minecraftServerStatusLookup(query),
      sportsLookup(query),
      originHistoryLookup(query),
      duckDuckGoLookup(query),
      wikipediaLookup(query),
      wikidataLookup(query),
      stackExchangeLookup(query),
      linuxDriverSourceLookup(query),
      cpuComparisonSourceLookup(query),
      archInstallLookup(query),
      extraPublicApiLookup(query),
      minecraftWikiLookup(query),
      fandomWikiLookup(query),
      openLibraryLookup(query),
      dictionaryLookup(query),
      githubLookup(query),
      packageLookup(query),
      countryLookup(query),
    ]),
  ].map((task) => withTimeout(task, API_TIMEOUT_MS));
  const results = await Promise.allSettled(tasks);
  const candidates = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value || [])
    .filter((candidate) => candidate.answer);

  if (candidates.length) {
    candidates.sort((a, b) => scoreCandidate(mainQuery, b) - scoreCandidate(mainQuery, a));
    const best = candidates[0];
    const bestScore = scoreCandidate(mainQuery, best);
    const useful = candidates.filter((candidate) => scoreCandidate(mainQuery, candidate) >= Math.max(4, bestScore - 10));
    const sources = uniqueSources(useful.slice(0, 7).map((candidate) => candidate.source));
    const mismatch = mismatchReason(mainQuery, best, bestScore);
    if (mismatch) {
      return {
        answer: mismatch,
        sources,
      };
    }
    return {
      answer: composeAnswer(mainQuery, best, useful),
      sources,
    };
  }

  return {
    answer: `I could not find enough source-backed info for "${mainQuery}". ${suggestBetterQuery(mainQuery)}`,
    sources: [],
  };
}

async function minecraftServerStatusLookup(query) {
  const lower = query.toLowerCase();
  if (!/(minecraft|mc)\s+server|server\s+(status|ping)|ping\s+.+|status\s+of\s+/.test(lower)) return [];
  const address = extractServerAddress(query);
  if (!address) return [];

  const bedrock = /\b(bedrock|pe|pocket)\b/i.test(query);
  const endpoint = bedrock
    ? `https://api.mcsrvstat.us/bedrock/3/${encodeURIComponent(address)}`
    : `https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Minecraft server status lookup failed");
  const data = await response.json();
  const online = data.online ? "online" : "offline";
  const players = data.players
    ? `${data.players.online ?? 0}/${data.players.max ?? "?"} players`
    : "player count unavailable";
  const version = data.version || data.protocol?.name || "unknown version";
  const motd = data.motd?.clean?.filter(Boolean).join(" ").trim();
  const ipLine = data.ip && data.port ? `${data.ip}:${data.port}` : address;
  const answer = data.online
    ? `${address} is online. It is running ${version} at ${ipLine} with ${players}.${motd ? ` MOTD: ${motd}` : ""}`
    : `${address} appears to be offline or unreachable from the public ping API.`;

  return [{
    answer,
    text: `${address} ${online} ${players} ${version} ${motd || ""} Minecraft server status ping`,
    sourceBoost: 8,
    source: {
      title: "mcsrvstat.us Minecraft Server Status API",
      url: endpoint,
      snippet: `${address}: ${online}, ${players}, ${version}`,
    },
  }];
}

async function mojangMinecraftLookup(query) {
  const lower = query.toLowerCase();
  if (
    !lower.includes("minecraft") ||
    /\brd\b|pre-classic|historical|oldest/.test(lower) ||
    !/\b(last|latest|current|newest|version|launcher|release)\b/.test(lower)
  ) {
    return [];
  }

  const url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Minecraft version manifest lookup failed");
  const data = await response.json();
  const latestRelease = data.latest?.release;
  const latestSnapshot = data.latest?.snapshot;
  if (!latestRelease && !latestSnapshot) return [];

  const answer = latestSnapshot && latestSnapshot !== latestRelease
    ? `The latest Minecraft Java Edition release in the launcher manifest is ${latestRelease}. The latest snapshot listed is ${latestSnapshot}.`
    : `The latest Minecraft Java Edition release in the launcher manifest is ${latestRelease}.`;

  return [{
    answer,
    text: `${answer} ${latestRelease || ""} ${latestSnapshot || ""} Minecraft launcher version manifest`,
    source: {
      title: "Mojang version manifest",
      url,
      snippet: `Latest release: ${latestRelease || "unknown"}. Latest snapshot: ${latestSnapshot || "unknown"}.`,
    },
  }];
}

async function fandomWikiLookup(query) {
  const info = fandomRequestInfo(query);
  if (!info) return [];
  return mediaWikiLookup({
    query: info.search,
    api: `https://${info.slug}.fandom.com/api.php`,
    title: `${info.label} Fandom`,
    sourceBoost: 12,
    introOnly: false,
  });
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
      answer: text,
      text,
      source: { title: data.Heading || "DuckDuckGo", url: data.AbstractURL || url, snippet: text },
    });
  }
  for (const topic of flattenRelatedTopics(data.RelatedTopics || [])) {
    if (topic.Text && topic.FirstURL) {
      candidates.push({
        answer: topic.Text,
        text: topic.Text,
        source: { title: topic.Text.split(" - ")[0], url: topic.FirstURL, snippet: topic.Text },
      });
    }
  }
  return candidates;
}

async function openLibraryLookup(query) {
  const lower = query.toLowerCase();
  if (!/\b(book|author|novel|isbn|open library)\b/.test(lower)) return [];
  const search = query
    .replace(/^(find|search|look up|what is|tell me about)\s+/i, "")
    .replace(/\b(book|novel|open library|called|named|title)\b/gi, "")
    .trim();
  if (search.length < 3) return [];

  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(search)}&limit=8`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Open Library lookup failed");
  const data = await response.json();
  return (data.docs || [])
    .filter((book) => book.title)
    .map((book) => {
      const author = book.author_name?.slice(0, 3).join(", ") || "unknown author";
      const year = book.first_publish_year || "unknown year";
      const text = `${book.title} by ${author}, first published ${year}.`;
      const boost = normalizeTitle(book.title) === normalizeTitle(search) ? 8 : 2;
      return {
        answer: text,
        text: `${text} ${book.subject?.slice(0, 8).join(" ") || ""}`,
        sourceBoost: boost,
        source: {
          title: `Open Library: ${book.title}`,
          url: book.key ? `https://openlibrary.org${book.key}` : url,
          snippet: text,
        },
      };
    })
    .sort((a, b) => (b.sourceBoost || 0) - (a.sourceBoost || 0))
    .slice(0, 5);
}

async function dictionaryLookup(query) {
  const word = dictionaryWord(query);
  if (!word) return [];
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  const entry = data[0];
  const meaning = entry?.meanings?.[0];
  const definition = meaning?.definitions?.[0]?.definition;
  if (!definition) return [];
  const part = meaning.partOfSpeech ? ` (${meaning.partOfSpeech})` : "";
  const answer = `${entry.word}${part}: ${definition}`;
  return [{
    answer,
    text: `${entry.word} ${meaning.partOfSpeech || ""} ${definition}`,
    source: {
      title: "Free Dictionary API",
      url,
      snippet: answer,
    },
  }];
}

async function githubLookup(query) {
  const target = githubTarget(query);
  if (!target) return [];

  if (target.repo) {
    const url = `https://api.github.com/repos/${target.repo}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const repo = await response.json();
    const answer = `${repo.full_name} is a GitHub repository${repo.description ? `: ${repo.description}` : "."} It has ${repo.stargazers_count ?? 0} stars, ${repo.forks_count ?? 0} forks, and its default branch is ${repo.default_branch || "unknown"}.`;
    return [{
      answer,
      text: `${repo.full_name} ${repo.description || ""} ${repo.language || ""} github repository`,
      sourceBoost: 4,
      source: {
        title: `GitHub: ${repo.full_name}`,
        url: repo.html_url || url,
        snippet: answer,
      },
    }];
  }

  const url = `https://api.github.com/users/${target.user}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const user = await response.json();
  const answer = `${user.login} is a GitHub user${user.name ? ` named ${user.name}` : ""}. Public repos: ${user.public_repos ?? 0}. Followers: ${user.followers ?? 0}.${user.bio ? ` Bio: ${user.bio}` : ""}`;
  return [{
    answer,
    text: `${user.login} ${user.name || ""} ${user.bio || ""} github user`,
    sourceBoost: 4,
    source: {
      title: `GitHub: ${user.login}`,
      url: user.html_url || url,
      snippet: answer,
    },
  }];
}

async function packageLookup(query) {
  const request = packageRequest(query);
  if (!request) return [];
  return request.kind === "npm" ? npmLookup(request.name) : pypiLookup(request.name);
}

async function npmLookup(name) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  const latest = data["dist-tags"]?.latest || "unknown";
  const answer = `${name} latest npm version is ${latest}.${data.description ? ` ${data.description}` : ""}`;
  return [{
    answer,
    text: `${name} npm package ${latest} ${data.description || ""}`,
    source: {
      title: `npm: ${name}`,
      url: `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
      snippet: answer,
    },
  }];
}

async function pypiLookup(name) {
  const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  const info = data.info || {};
  const answer = `${name} latest PyPI version is ${info.version || "unknown"}.${info.summary ? ` ${info.summary}` : ""}`;
  return [{
    answer,
    text: `${name} python pypi package ${info.version || ""} ${info.summary || ""}`,
    source: {
      title: `PyPI: ${name}`,
      url: info.package_url || `https://pypi.org/project/${encodeURIComponent(name)}/`,
      snippet: answer,
    },
  }];
}

async function countryLookup(query) {
  const name = countryName(query);
  if (!name) return [];
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&origin=*&limit=5`;
  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) return [];
  const searchData = await searchResponse.json();
  const item = (searchData.search || []).find((entry) => /country|sovereign|nation|state/i.test(entry.description || "")) || searchData.search?.[0];
  if (!item?.id) return [];

  const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${item.id}.json`;
  const entityResponse = await fetch(entityUrl);
  if (!entityResponse.ok) return [];
  const entityData = await entityResponse.json();
  const entity = entityData.entities?.[item.id];
  if (!entity) return [];

  const claims = entity.claims || {};
  const linkedIds = [
    ...wikidataItemIds(claims.P36).slice(0, 1),
    ...wikidataItemIds(claims.P38).slice(0, 2),
    ...wikidataItemIds(claims.P37).slice(0, 4),
  ];
  const labels = await wikidataLabels(linkedIds);
  const capital = labels[wikidataItemIds(claims.P36)[0]] || "unknown";
  const currencies = wikidataItemIds(claims.P38).slice(0, 2).map((id) => labels[id]).filter(Boolean).join(", ") || "unknown";
  const languages = wikidataItemIds(claims.P37).slice(0, 4).map((id) => labels[id]).filter(Boolean).join(", ") || "unknown";
  const population = wikidataQuantity(claims.P1082);
  const label = entity.labels?.en?.value || item.label || name;
  const description = entity.descriptions?.en?.value || item.description || "country";
  const answer = `${label} is ${description}. Capital: ${capital}. Population: ${population ? Number(population).toLocaleString() : "unknown"}. Currency: ${currencies}. Official language: ${languages}.`;
  return [{
    answer,
    text: `${label} ${description} ${capital} ${population || ""} ${currencies} ${languages}`,
    source: {
      title: `Wikidata: ${label}`,
      url: entity.concepturi || `https://www.wikidata.org/wiki/${item.id}`,
      snippet: answer,
    },
  }];
}

function wikidataItemIds(claims = []) {
  return rankedClaims(claims)
    .map((claim) => claim.mainsnak?.datavalue?.value?.["numeric-id"])
    .filter(Boolean)
    .map((id) => `Q${id}`);
}

function wikidataQuantity(claims = []) {
  return rankedClaims(claims)
    .map((claim) => claim.mainsnak?.datavalue?.value?.amount)
    .filter(Boolean)
    .map((amount) => Number(amount))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] || null;
}

function rankedClaims(claims = []) {
  const preferred = claims.filter((claim) => claim.rank === "preferred");
  const normal = claims.filter((claim) => claim.rank !== "deprecated");
  return preferred.length ? preferred : normal;
}

async function wikidataLabels(ids) {
  const uniqueIds = uniqueStrings(ids);
  if (!uniqueIds.length) return {};
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(uniqueIds.join("|"))}&props=labels&languages=en&format=json&origin=*`;
  const response = await fetch(url);
  if (!response.ok) return {};
  const data = await response.json();
  return Object.fromEntries(Object.entries(data.entities || {}).map(([id, entity]) => [id, entity.labels?.en?.value]).filter(([, label]) => label));
}

async function weatherLookup(query) {
  const location = weatherLocation(query);
  if (!location) return [];
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=3&language=en&format=json`;
  const geoResponse = await fetch(geoUrl);
  if (!geoResponse.ok) return [];
  const geo = await geoResponse.json();
  const place = geo.results?.[0];
  if (!place) return [];

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const weatherResponse = await fetch(weatherUrl);
  if (!weatherResponse.ok) return [];
  const data = await weatherResponse.json();
  const current = data.current || {};
  const daily = data.daily || {};
  const label = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
  const answer = `${label} is ${Math.round(current.temperature_2m)}F now with ${current.relative_humidity_2m}% humidity, ${current.wind_speed_10m} mph wind, and ${current.precipitation} in precipitation. Today: high ${Math.round(daily.temperature_2m_max?.[0])}F, low ${Math.round(daily.temperature_2m_min?.[0])}F, precipitation chance ${daily.precipitation_probability_max?.[0] ?? "unknown"}%.`;
  return [{
    answer,
    text: `${label} weather forecast temperature humidity wind precipitation`,
    sourceBoost: 5,
    source: {
      title: "Open-Meteo Weather API",
      url: weatherUrl,
      snippet: answer,
    },
  }];
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
      answer: result.value.extract,
      text: `${result.value.title} ${result.value.extract}`,
      source: {
        title: result.value.title,
        url: result.value.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(result.value.title)}`,
        snippet: result.value.extract,
      },
    }));
}

async function originHistoryLookup(query) {
  if (!isOriginHistoryQuestion(query)) return [];
  const subject = originHistorySubject(query);
  if (!subject) return [];

  const titles = uniqueStrings([
    subject,
    `${subject} history`,
    `History of ${subject}`,
  ]);

  const results = await Promise.allSettled(titles.map(async (title) => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&titles=${encodeURIComponent(title)}&explaintext=1&exchars=4500&inprop=url&format=json&origin=*`;
    const response = await fetchWithTimeout(url, API_TIMEOUT_MS);
    if (!response.ok) return null;
    const data = await response.json();
    const page = data?.query?.pages ? Object.values(data.query.pages)[0] : null;
    if (!page?.extract || page.missing) return null;
    const answer = originHistoryAnswer(query, subject, page);
    return {
      answer,
      text: `${page.title} ${page.extract} ${subject} first oldest earliest origin history ancient invented made`,
      sourceBoost: page.title && normalizeTitle(page.title).includes(normalizeTitle(subject)) ? 18 : 10,
      intent: "origin_history",
      source: {
        title: `Wikipedia: ${page.title}`,
        url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title || title)}`,
        snippet: answer,
      },
    };
  }));

  return results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
}

function isOriginHistoryQuestion(query) {
  return /\b(first|oldest|earliest|original|origin|origins|history|invented|made first|created first)\b/i.test(query);
}

function originHistorySubject(query) {
  return cleanLookupQuery(query)
    .replace(/\b(what|which|who|when|where|was|were|is|are|the|a|an|first|oldest|earliest|original|origin|origins|history|invented|made|created|ever|known|kind|type|of)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function originHistoryAnswer(query, subject, page) {
  const extract = page.extract || "";
  const historyText = historyTextFromExtract(extract) || extract;
  const sentences = sentenceParts(historyText);
  const evidenceSentences = sentences.filter((sentence) => !/\b(word|term|language|roots?|Arabic|Persian|Sanskrit|French|English)\b/i.test(sentence));
  const historySentence =
    evidenceSentences.find((sentence) => /\b(pieces of sugar|boiling sugarcane|consumed as khanda)\b/i.test(sentence)) ||
    evidenceSentences.find((sentence) => /\b(sugarcane|ancient India|reeds that produce honey)\b/i.test(sentence)) ||
    evidenceSentences.find((sentence) => /\b(ancient|origin|began|dates|date back|invented|made|created|honey)\b/i.test(sentence)) ||
    sentences.find((sentence) => /\bsugar\b/i.test(sentence));
  let main = historySentence || sentences[0] || extract;
  const index = sentences.indexOf(historySentence);
  const next = index >= 0 ? sentences[index + 1] : "";
  if (next && /\bsugarcane is indigenous\b/i.test(main) && /\bpieces of sugar|boiling sugarcane|khanda\b/i.test(next)) {
    main = `${main} ${next}`;
  }

  if (/\b(first|oldest|earliest)\b/i.test(query)) {
    return `There may not be one single provable “first ${subject}.” The oldest source-backed answer I found points to this: ${plainFact(cleanFact(main))}`;
  }

  return plainFact(cleanFact(main));
}

function historyTextFromExtract(extract) {
  const match = String(extract).match(/==\s*History\s*==([\s\S]*?)(?:\n==[^=]|$)/i);
  return match?.[1]?.trim() || "";
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
        answer: `${text}.`,
        text,
        source: {
          title: item.label,
          url: item.concepturi || `https://www.wikidata.org/wiki/${item.id}`,
          snippet: item.description,
        },
      };
    });
}

async function stackExchangeLookup(query) {
  if (!isProblemRequest(query.toLowerCase()) && !/\b(error|exception|troubleshoot|debug|fix|issue|problem|bios|uefi|f1|f2|setup|driver|drivers|linux|not work|work well)\b/i.test(query)) {
    return [];
  }

  const sites = stackExchangeSites(query);
  const searches = await Promise.allSettled(sites.map((site) => stackExchangeSiteSearch(site, query)));
  return searches
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value)
    .slice(0, 8);
}

async function linuxDriverSourceLookup(query) {
  const lower = query.toLowerCase();
  if (!isLinuxDriverQuestion(lower)) return [];
  const pages = ["Nvidia", "Nouveau (software)", "Wayland (protocol)", "Direct Rendering Manager"];
  const results = await Promise.allSettled(pages.map(async (page) => {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`;
    const response = await fetchWithTimeout(url, API_TIMEOUT_MS);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.extract) return null;
    return {
      answer: data.extract,
      text: `${data.title} ${data.extract} NVIDIA Linux driver drivers proprietary open source Nouveau Wayland kernel graphics`,
      sourceBoost: 12,
      source: {
        title: `Wikipedia: ${data.title}`,
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(page)}`,
        snippet: data.extract,
      },
    };
  }));
  return results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
}

async function cpuComparisonSourceLookup(query) {
  const lower = query.toLowerCase();
  if (!isCpuComparisonQuestion(lower)) return [];
  const pages = ["Advanced Micro Devices", "Intel", "Ryzen", "Intel Core"];
  const results = await Promise.allSettled(pages.map(async (page) => {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`;
    const response = await fetchWithTimeout(url, API_TIMEOUT_MS);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.extract) return null;
    return {
      answer: data.extract,
      text: `${data.title} ${data.extract} AMD Intel Ryzen Core CPU processor processors performance power price comparison`,
      sourceBoost: 12,
      source: {
        title: `Wikipedia: ${data.title}`,
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(page)}`,
        snippet: data.extract,
      },
    };
  }));
  return results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
}

async function archInstallLookup(query) {
  const lower = query.toLowerCase();
  if (!/\b(arch|archlinux|arch linux)\b/.test(lower)) return [];
  if (!/\b(install|installation|guide|package|pacman|desktop|cosmic|kde|gnome)\b/.test(lower)) return [];

  const topic = topicSearchTerm(query, ["arch", "archlinux", "linux", "install", "installation", "guide", "page", "wiki", "desktop", "cosmic"]).trim() || (/\bcosmic\b/.test(lower) ? "cosmic" : "");
  const packages = await archPackageSearch(topic || query);
  const candidates = [];

  if (packages.length) {
    const names = packages.slice(0, 5).map((pkg) => pkg.pkgname).join(" ");
    const installNames = packages.slice(0, 3).map((pkg) => pkg.pkgname).join(" ");
    const answer = `On Arch Linux, install candidates for ${topic || "that desktop"} include ${names}. A practical first command to check is: sudo pacman -S ${installNames}`;
    candidates.push({
      answer,
      text: `${answer} Arch Linux pacman package install guide ${topic}`,
      sourceBoost: 16,
      source: {
        title: "Arch Linux Package Search",
        url: `https://archlinux.org/packages/?q=${encodeURIComponent(topic || query)}`,
        snippet: answer,
      },
    });
  }

  if (/\bcosmic\b/.test(lower)) {
    if (!packages.length) {
      const answer = "For COSMIC on Arch Linux, first run `pacman -Ss cosmic` to see the current package split. The main package to look for is `cosmic-session`; related COSMIC packages are split across names like `cosmic-panel`, `cosmic-settings`, `cosmic-files`, `cosmic-terminal`, and other `cosmic-*` packages. A sensible install check is `sudo pacman -S cosmic-session`, then add the pieces you want from the Arch package search results.";
      candidates.push({
        answer,
        text: `${answer} Arch Linux pacman install guide cosmic desktop cosmic-session cosmic-panel cosmic-settings`,
        sourceBoost: 18,
        source: {
          title: "Arch Linux Package Search: cosmic",
          url: "https://archlinux.org/packages/?q=cosmic",
          snippet: "Arch Linux package search for COSMIC packages.",
        },
      });
    }
    candidates.push({
      answer: "COSMIC is System76's desktop environment. On Arch-based systems, the relevant package names usually start with cosmic, so use Arch package search or pacman -Ss cosmic to see the current split packages before installing.",
      text: "COSMIC desktop Arch Linux install pacman cosmic-session cosmic desktop package System76",
      sourceBoost: 12,
      source: {
        title: "System76 COSMIC",
        url: "https://system76.com/cosmic/",
        snippet: "COSMIC is System76's desktop environment.",
      },
    });
  }

  return candidates;
}

async function archPackageSearch(term) {
  const clean = String(term || "").trim() || "cosmic";
  const url = `https://archlinux.org/packages/search/json/?q=${encodeURIComponent(clean)}`;
  const data = await fetchJson(url);
  return (data?.results || [])
    .filter((pkg) => pkg.pkgname)
    .sort((a, b) => Number(b.pkgname.includes(clean)) - Number(a.pkgname.includes(clean)))
    .slice(0, 8);
}

function stackExchangeSites(query) {
  const lower = query.toLowerCase();
  if (/\b(linux|ubuntu|debian|arch|fedora|driver|drivers|nvidia)\b/.test(lower)) {
    return ["unix", "askubuntu", "superuser", "stackoverflow"];
  }
  if (/\b(code|programming|python|java|javascript|c\+\+|node|npm|pypi|exception|stack trace)\b/.test(lower)) {
    return ["stackoverflow", "superuser"];
  }
  if (/\b(server|network|linux|dns|nginx|apache|ssh)\b/.test(lower)) {
    return ["serverfault", "superuser", "stackoverflow"];
  }
  return ["superuser", "stackoverflow"];
}

async function stackExchangeSiteSearch(site, query) {
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=${encodeURIComponent(site)}&pagesize=3&filter=withbody`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.items || [])
    .filter((item) => item.title && item.link)
    .map((item) => {
      const body = stripHtml(item.body || "");
      const text = `${item.title}. ${body}`.slice(0, 900);
      return {
        answer: text,
        text: `${item.title} ${body} ${(item.tags || []).join(" ")}`,
        sourceBoost: 5,
        source: {
          title: `${site}: ${decodeHtml(item.title)}`,
          url: item.link,
          snippet: text,
        },
      };
    });
}

async function extraPublicApiLookup(query, includeGeneral = true) {
  const matched = extraApiProviders()
    .filter((provider) => provider.match(query.toLowerCase()))
    .filter((provider) => includeGeneral || !provider.general)
    .filter((provider) => !isProblemRequest(query.toLowerCase()) || !["Wikibooks", "Wikiversity"].includes(provider.name));
  const providers = [
    ...matched.filter((provider) => !provider.general),
    ...matched.filter((provider) => provider.general),
  ].slice(0, 16);
  const results = await Promise.allSettled(providers.map((provider) => withTimeout(provider.lookup(query), API_TIMEOUT_MS)));
  return results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value || [])
    .filter((candidate) => candidate.answer)
    .slice(0, 20);
}

function extraApiProviders() {
  const wiki = (name, api, match, boost = 1, general = false) => ({
    name,
    match,
    general,
    lookup: (query) => mediaWikiLookup({ query, api, title: name, sourceBoost: boost }),
  });
  const any = () => true;
  return [
    wiki("Simple Wikipedia", "https://simple.wikipedia.org/w/api.php", any, 1, true),
    wiki("Wiktionary", "https://en.wiktionary.org/w/api.php", (q) => /\b(define|definition|meaning|word|etymology|pronounce|dictionary)\b/.test(q), 4),
    wiki("Wikiquote", "https://en.wikiquote.org/w/api.php", (q) => /\b(quote|said|saying|speech)\b/.test(q), 3),
    wiki("Wikibooks", "https://en.wikibooks.org/w/api.php", (q) => /\b(how to|tutorial|guide|learn|course|book)\b/.test(q), 3),
    wiki("Wikiversity", "https://en.wikiversity.org/w/api.php", (q) => /\b(learn|course|study|education|lesson)\b/.test(q), 3),
    wiki("Wikivoyage", "https://en.wikivoyage.org/w/api.php", (q) => /\b(travel|trip|visit|hotel|airport|city|country)\b/.test(q), 3),
    wiki("Wikinews", "https://en.wikinews.org/w/api.php", (q) => /\b(news|latest|recent|today|yesterday)\b/.test(q), 2),
    wiki("Wikimedia Commons", "https://commons.wikimedia.org/w/api.php", (q) => /\b(image|photo|picture|media|file|map)\b/.test(q), 2),
    wiki("Wikisource", "https://en.wikisource.org/w/api.php", (q) => /\b(source text|public domain|poem|speech|document)\b/.test(q), 2),
    { name: "MDN", match: (q) => /\b(html|css|javascript|web api|browser|dom|fetch|canvas)\b/.test(q), lookup: mdnLookup },
    { name: "Hacker News", match: (q) => /\b(hacker news|startup|programming|tech news|yc)\b/.test(q), lookup: hackerNewsLookup },
    { name: "Crossref", match: (q) => /\b(paper|research|journal|doi|study|citation)\b/.test(q), lookup: crossrefLookup },
    { name: "OpenAlex", match: (q) => /\b(paper|research|journal|study|citation|author)\b/.test(q), lookup: openAlexLookup },
    { name: "Semantic Scholar", match: (q) => /\b(paper|research|study|academic|science)\b/.test(q), lookup: semanticScholarLookup },
    { name: "arXiv", match: (q) => /\b(arxiv|paper|research|machine learning|physics|math|computer science)\b/.test(q), lookup: arxivLookup },
    { name: "PubMed", match: (q) => /\b(pubmed|medical|medicine|health|disease|clinical|symptom)\b/.test(q), lookup: pubMedLookup },
    { name: "TVMaze", match: (q) => /\b(tv|show|episode|series|actor)\b/.test(q), lookup: tvMazeLookup },
    { name: "Jikan", match: (q) => /\b(anime|manga|mal)\b/.test(q), lookup: jikanLookup },
    { name: "PokeAPI", match: (q) => /\b(pokemon|pokémon|pokedex)\b/.test(q), lookup: pokeLookup },
    { name: "OpenStreetMap Nominatim", match: (q) => /\b(address|map|where is|location|coordinates|geocode)\b/.test(q), lookup: nominatimLookup },
    { name: "MusicBrainz", match: (q) => /\b(artist|album|song|band|music)\b/.test(q), lookup: musicBrainzLookup },
    { name: "iTunes Search", match: (q) => /\b(app|podcast|song|album|movie|itunes)\b/.test(q), lookup: itunesLookup },
    { name: "Open Food Facts", match: (q) => /\b(food|barcode|nutrition|calories|ingredient)\b/.test(q), lookup: openFoodFactsLookup },
    { name: "GBIF", match: (q) => /\b(species|taxonomy|plant|animal|genus|biology)\b/.test(q), lookup: gbifLookup },
    { name: "iNaturalist", match: (q) => /\b(species|plant|animal|wildlife|nature)\b/.test(q), lookup: iNaturalistLookup },
    { name: "CoinGecko", match: (q) => /\b(crypto|bitcoin|ethereum|coin|token price)\b/.test(q), lookup: coinGeckoLookup },
    { name: "World Bank", match: (q) => /\b(gdp|population|economy|world bank|indicator)\b/.test(q), lookup: worldBankLookup },
    { name: "Universities", match: (q) => /\b(university|college|school)\b/.test(q), lookup: universitiesLookup },
    { name: "ESPN Sports", match: (q) => isSportsQuestion(q), lookup: sportsLookup },
    { name: "crates.io", match: (q) => /\b(rust crate|crate|cargo)\b/.test(q), lookup: cratesLookup },
    { name: "RubyGems", match: (q) => /\b(ruby gem|rubygems|gem)\b/.test(q), lookup: rubyGemsLookup },
    { name: "Packagist", match: (q) => /\b(php package|composer package|packagist)\b/.test(q), lookup: packagistLookup },
    { name: "Maven Central", match: (q) => /\b(maven|java library|artifact)\b/.test(q), lookup: mavenLookup },
    { name: "NuGet", match: (q) => /\b(nuget|dotnet package|\\.net package)\b/.test(q), lookup: nugetLookup },
    { name: "Docker Hub", match: (q) => /\b(docker image|container image|docker hub)\b/.test(q), lookup: dockerHubLookup },
    { name: "Homebrew", match: (q) => /\b(homebrew|brew formula|brew package)\b/.test(q), lookup: homebrewLookup },
  ];
}

async function fetchJson(url) {
  try {
    const response = await fetchWithTimeout(url, API_TIMEOUT_MS);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve([]), ms)),
  ]);
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function apiCandidate(title, url, answer, extra = "", boost = 2) {
  if (!answer) return null;
  return {
    answer,
    text: `${title} ${answer} ${extra}`,
    sourceBoost: boost,
    source: { title, url, snippet: answer },
  };
}

async function sportsLookup(query) {
  if (!isSportsQuestion(query)) return [];

  const team = await espnTeamMatch(query);
  const candidates = [];

  if (isSportsCoachQuestion(query)) {
    const coach = await sportsCoachLookup(query, team);
    if (coach) candidates.push(coach);
  }

  if (team) {
    const record = team.record?.items?.[0]?.summary || team.record?.summary || "";
    const answer = record
      ? `${team.displayName} are listed by ESPN with a ${record} record.`
      : `${team.displayName} are listed by ESPN as an active ${team.sportLabel || "sports"} team.`;
    candidates.push(apiCandidate(
      `ESPN: ${team.displayName}`,
      team.url,
      answer,
      `${team.displayName} ${team.slug || ""} ${team.sportLabel || ""}`,
      6,
    ));
  }

  return candidates.filter(Boolean);
}

function isSportsQuestion(query) {
  return /\b(coach|head coach|manager|roster|schedule|score|record|standings|team|football|basketball|baseball|hockey|soccer|nfl|nba|mlb|nhl|ncaaf|college football|notre dame|fighting irish)\b/i.test(query);
}

function isSportsCoachQuestion(query) {
  return /\b(coach|head coach|manager|skipper)\b/i.test(query);
}

async function espnTeamMatch(query) {
  const lower = query.toLowerCase();
  const sports = espnSportsForQuery(lower);
  const queryWords = importantTerms(query).filter((word) => !sportsStopWords().has(word));
  let best = null;
  let bestScore = 0;

  for (const sport of sports) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport.path}/teams?limit=1000`;
    const data = await fetchJson(url);
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams?.map((item) => item.team) || [];
    for (const team of teams) {
      const haystack = normalizeTitle(`${team.displayName} ${team.shortDisplayName} ${team.nickname} ${team.name} ${team.location} ${team.slug} ${team.abbreviation}`);
      const score = queryWords.reduce((total, word) => total + (haystack.includes(normalizeTitle(word)) ? 1 : 0), 0);
      const exactBonus = normalizeTitle(query).includes(normalizeTitle(team.displayName)) ? 4 : 0;
      const total = score + exactBonus;
      if (total > bestScore) {
        bestScore = total;
        best = {
          ...team,
          sportLabel: sport.label,
          sportPath: sport.path,
          url: team.links?.find((link) => link.rel?.includes("clubhouse"))?.href ||
            `https://www.espn.com/${sport.path}/team/_/id/${team.id}/${team.slug || ""}`,
        };
      }
    }
  }

  return bestScore >= Math.min(2, Math.max(1, queryWords.length)) ? best : null;
}

function espnSportsForQuery(lower) {
  const sports = [
    { label: "college football", path: "football/college-football", match: /\b(college football|ncaaf|notre dame|fighting irish)\b/ },
    { label: "NFL", path: "football/nfl", match: /\b(nfl|football)\b/ },
    { label: "NBA", path: "basketball/nba", match: /\b(nba|basketball)\b/ },
    { label: "MLB", path: "baseball/mlb", match: /\b(mlb|baseball)\b/ },
    { label: "NHL", path: "hockey/nhl", match: /\b(nhl|hockey)\b/ },
    { label: "college basketball", path: "basketball/mens-college-basketball", match: /\b(college basketball|ncaab)\b/ },
  ];
  const matched = sports.filter((sport) => sport.match.test(lower));
  return matched.length ? matched : sports;
}

function sportsStopWords() {
  return new Set([
    "who", "what", "when", "where", "is", "are", "was", "were", "the", "a", "an", "of", "for",
    "coach", "head", "manager", "team", "sports", "football", "basketball", "baseball", "hockey",
    "soccer", "current", "now",
  ]);
}

async function sportsCoachLookup(query, team) {
  const titles = sportsCoachPageTitles(query, team);
  for (const title of titles) {
    const result = await wikipediaInfoboxField(title, ["HeadCoach", "Head coach", "Coach", "Manager"]);
    if (!result?.value) continue;
    const coach = cleanWikiValue(result.value);
    if (!coach) continue;
    const teamName = team?.displayName || result.title;
    return {
      answer: `${coach} is the current head coach of ${teamName}.`,
      text: `${teamName} ${coach} current head coach sports ${query}`,
      intent: "sports_coach",
      sourceBoost: 18,
      source: {
        title: `Wikipedia infobox: ${result.title}`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replaceAll(" ", "_"))}`,
        snippet: `Head coach: ${coach}`,
      },
    };
  }
  return null;
}

function sportsCoachPageTitles(query, team) {
  const titles = [];
  if (team?.displayName) {
    if (team.sportLabel === "college football") titles.push(`${team.displayName} football`);
    titles.push(team.displayName);
  }

  const clean = cleanLookupQuery(query)
    .replace(/\b(current|who|what|is|are|was|were|the|head|coach|manager|of|for|team|now)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bnotre dame\b/i.test(query) && /\bfootball\b/i.test(query)) {
    titles.unshift("Notre Dame Fighting Irish football");
  }
  if (clean) {
    titles.push(clean);
    if (/\bfootball\b/i.test(query) && !/\bfootball\b/i.test(clean)) titles.push(`${clean} football`);
  }

  return uniqueStrings(titles);
}

async function wikipediaInfoboxField(title, fields) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&titles=${encodeURIComponent(title)}&rvprop=content&rvslots=main&format=json&origin=*`;
  const data = await fetchJson(url);
  const page = data?.query?.pages ? Object.values(data.query.pages)[0] : null;
  const text = page?.revisions?.[0]?.slots?.main?.["*"];
  if (!text || page.missing) return null;

  for (const field of fields) {
    const escaped = escapeRegExp(field).replace(/\\ /g, "\\s*");
    const match = text.match(new RegExp(`\\|\\s*${escaped}\\s*=\\s*([^\\n]+)`, "i"));
    if (match?.[1]) return { title: page.title || title, value: match[1] };
  }
  return null;
}

function cleanWikiValue(value) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<ref[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^>]*\/>/gi, " ")
    .replace(/\{\{nowrap\|([^{}]+)\}\}/gi, "$1")
    .replace(/\{\{small\|([^{}]+)\}\}/gi, "$1")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function mdnLookup(query) {
  if (!/\b(html|css|javascript|web api|browser|dom|fetch|canvas)\b/i.test(query)) return [];
  const url = `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(topicSearchTerm(query, ["web", "api", "browser", "dom"]))}`;
  const data = await fetchJson(url);
  return (data?.documents || []).slice(0, 3).map((item) => apiCandidate(`MDN: ${item.title}`, `https://developer.mozilla.org${item.mdn_url}`, item.summary, item.title, 5)).filter(Boolean);
}

async function hackerNewsLookup(query) {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=3`;
  const data = await fetchJson(url);
  return (data?.hits || []).map((hit) => apiCandidate(`Hacker News: ${hit.title}`, hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`, `${hit.title}. Points: ${hit.points || 0}. Comments: ${hit.num_comments || 0}.`, "", 3)).filter(Boolean);
}

async function crossrefLookup(query) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3`;
  const data = await fetchJson(url);
  return (data?.message?.items || []).map((item) => apiCandidate(`Crossref: ${(item.title || [])[0]}`, item.URL, `${(item.title || [])[0] || "Research work"}${item.published?.["date-parts"]?.[0]?.[0] ? ` was published in ${item.published["date-parts"][0][0]}` : ""}.`, (item.author || []).map((a) => `${a.given || ""} ${a.family || ""}`).join(" "), 3)).filter(Boolean);
}

async function openAlexLookup(query) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=3`;
  const data = await fetchJson(url);
  return (data?.results || []).map((item) => apiCandidate(`OpenAlex: ${item.title}`, item.doi || item.id, `${item.title}. Cited by ${item.cited_by_count || 0} works.`, item.abstract_inverted_index ? Object.keys(item.abstract_inverted_index).slice(0, 40).join(" ") : "", 3)).filter(Boolean);
}

async function semanticScholarLookup(query) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=3&fields=title,abstract,url,year,citationCount`;
  const data = await fetchJson(url);
  return (data?.data || []).map((item) => apiCandidate(`Semantic Scholar: ${item.title}`, item.url, `${item.title}${item.year ? ` (${item.year})` : ""}. Citations: ${item.citationCount || 0}.${item.abstract ? ` ${item.abstract.slice(0, 220)}` : ""}`, "", 3)).filter(Boolean);
}

async function arxivLookup(query) {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=3`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const xml = await response.text();
  return [...xml.matchAll(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<summary>([\s\S]*?)<\/summary>[\s\S]*?<id>(.*?)<\/id>/g)]
    .map((match) => apiCandidate(`arXiv: ${cleanXml(match[1])}`, cleanXml(match[3]), cleanXml(match[2]).slice(0, 300), cleanXml(match[1]), 3))
    .filter(Boolean);
}

async function pubMedLookup(query) {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=3&term=${encodeURIComponent(query)}`;
  const search = await fetchJson(searchUrl);
  const ids = search?.esearchresult?.idlist || [];
  if (!ids.length) return [];
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`;
  const summary = await fetchJson(summaryUrl);
  return ids.map((id) => {
    const item = summary?.result?.[id];
    return apiCandidate(`PubMed: ${item?.title}`, `https://pubmed.ncbi.nlm.nih.gov/${id}/`, `${item?.title || "PubMed article"}${item?.pubdate ? ` (${item.pubdate})` : ""}.`, "", 3);
  }).filter(Boolean);
}

async function tvMazeLookup(query) {
  if (!/\b(tv|show|episode|series|actor)\b/i.test(query)) return [];
  const term = topicSearchTerm(query, ["tv", "show", "episode", "series", "actor"]);
  const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`;
  const data = await fetchJson(url);
  return (data || [])
    .slice(0, 5)
    .map(({ show }) => apiCandidate(`TVMaze: ${show.name}`, show.url, `${show.name}${show.premiered ? ` premiered ${show.premiered}` : ""}.${show.summary ? ` ${stripHtml(show.summary).slice(0, 220)}` : ""}`, show.genres?.join(" "), normalizeTitle(show.name) === normalizeTitle(term) ? 10 : 3))
    .filter(Boolean)
    .sort((a, b) => (b.sourceBoost || 0) - (a.sourceBoost || 0))
    .slice(0, 3);
}

async function jikanLookup(query) {
  if (!/\b(anime|manga|mal)\b/i.test(query)) return [];
  const term = topicSearchTerm(query, ["anime", "manga", "mal"]);
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(term)}&limit=5`;
  const data = await fetchJson(url);
  return (data?.data || [])
    .map((item) => apiCandidate(`Jikan: ${item.title}`, item.url, `${item.title}${item.year ? ` (${item.year})` : ""}. Score: ${item.score || "unknown"}.${item.synopsis ? ` ${item.synopsis.slice(0, 220)}` : ""}`, "", normalizeTitle(item.title) === normalizeTitle(term) ? 10 : 3))
    .filter(Boolean)
    .sort((a, b) => (b.sourceBoost || 0) - (a.sourceBoost || 0))
    .slice(0, 3);
}

async function pokeLookup(query) {
  const dexNumber = pokedexNumber(query);
  if (dexNumber) {
    const url = `https://pokeapi.co/api/v2/pokemon/${dexNumber}`;
    const data = await fetchJson(url);
    if (!data?.name) return [];
    return [apiCandidate(`PokeAPI: ${data.name}`, url, `${capitalize(data.name)} is Pokemon #${data.id} in the National Pokedex. Types: ${(data.types || []).map((t) => t.type.name).join(", ")}.`, "", 8)];
  }

  const name = cleanLookupQuery(query)
    .toLowerCase()
    .replace(/\b(pokemon|pokémon|pokedex)\b/g, " ")
    .match(/[a-z0-9-]+/)?.[0];
  if (!name) return [];
  const url = `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`;
  const data = await fetchJson(url);
  if (!data?.name) return [];
  return [apiCandidate(`PokeAPI: ${data.name}`, url, `${data.name} is Pokemon #${data.id}. Types: ${(data.types || []).map((t) => t.type.name).join(", ")}.`, "", 4)];
}

async function nominatimLookup(query) {
  if (!/\b(address|map|where is|location|located|coordinates|coordinate|geocode)\b/i.test(query)) return [];
  const place = cleanLookupQuery(query)
    .replace(/\b(where is|coordinates|coordinate|address|map|location|located|locate|geocode|find|show me)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=${encodeURIComponent(place || cleanLookupQuery(query))}`;
  let data = await fetchJson(url);
  if ((!data || !data.length) && place !== cleanLookupQuery(query)) {
    data = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=${encodeURIComponent(cleanLookupQuery(query))}`);
  }
  return (data || []).map((item) => apiCandidate(`OpenStreetMap: ${item.display_name}`, `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}`, `${item.display_name}. Coordinates: ${item.lat}, ${item.lon}.`, item.type, 3)).filter(Boolean);
}

async function musicBrainzLookup(query) {
  if (!/\b(artist|album|song|band|music)\b/i.test(query)) return [];
  const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(topicSearchTerm(query, ["music", "artist", "album", "song", "band"]))}&fmt=json&limit=3`;
  const data = await fetchJson(url);
  return (data?.artists || []).map((artist) => apiCandidate(`MusicBrainz: ${artist.name}`, `https://musicbrainz.org/artist/${artist.id}`, `${artist.name}${artist.country ? ` is associated with ${artist.country}` : ""}.${artist.type ? ` Type: ${artist.type}.` : ""}`, artist.disambiguation || "", 3)).filter(Boolean);
}

async function itunesLookup(query) {
  if (!/\b(app|podcast|song|album|movie|itunes)\b/i.test(query)) return [];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(topicSearchTerm(query, ["itunes", "app", "podcast", "song", "album", "movie"]))}&limit=3`;
  const data = await fetchJson(url);
  return (data?.results || []).map((item) => apiCandidate(`iTunes: ${item.trackName || item.collectionName || item.artistName}`, item.trackViewUrl || item.collectionViewUrl || item.artistViewUrl, `${item.trackName || item.collectionName || item.artistName} by ${item.artistName || "unknown artist"}.${item.primaryGenreName ? ` Genre: ${item.primaryGenreName}.` : ""}`, "", 3)).filter(Boolean);
}

async function openFoodFactsLookup(query) {
  if (!/\b(food|barcode|nutrition|calories|ingredient)\b/i.test(query)) return [];
  const term = topicSearchTerm(query, ["food", "barcode", "nutrition", "calories", "ingredient"]);
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=5`;
  let data = await fetchJson(url);
  if (!data?.products?.length) {
    data = await fetchJson(`https://world.openfoodfacts.net/api/v2/search?search_terms=${encodeURIComponent(term)}&page_size=5`);
  }
  return (data?.products || [])
    .map((item) => apiCandidate(`Open Food Facts: ${item.product_name}`, item.url, `${item.product_name || "Food product"}.${item.nutriscore_grade ? ` Nutri-Score: ${item.nutriscore_grade}.` : ""}${item.brands ? ` Brand: ${item.brands}.` : ""}`, item.ingredients_text || "", normalizeTitle(item.product_name || "").includes(normalizeTitle(term)) ? 8 : 3))
    .filter(Boolean)
    .sort((a, b) => (b.sourceBoost || 0) - (a.sourceBoost || 0))
    .slice(0, 3);
}

async function gbifLookup(query) {
  if (!/\b(species|taxonomy|plant|animal|genus|biology)\b/i.test(query)) return [];
  const url = `https://api.gbif.org/v1/species/search?q=${encodeURIComponent(topicSearchTerm(query, ["species", "taxonomy", "plant", "animal", "genus", "biology"]))}&limit=3`;
  const data = await fetchJson(url);
  return (data?.results || []).map((item) => apiCandidate(`GBIF: ${item.scientificName || item.canonicalName}`, `https://www.gbif.org/species/${item.key}`, `${item.scientificName || item.canonicalName}.${item.kingdom ? ` Kingdom: ${item.kingdom}.` : ""}${item.rank ? ` Rank: ${item.rank}.` : ""}`, "", 3)).filter(Boolean);
}

async function iNaturalistLookup(query) {
  if (!/\b(species|plant|animal|wildlife|nature)\b/i.test(query)) return [];
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(topicSearchTerm(query, ["species", "plant", "animal", "wildlife", "nature"]))}&per_page=3`;
  const data = await fetchJson(url);
  return (data?.results || []).map((item) => apiCandidate(`iNaturalist: ${item.preferred_common_name || item.name}`, `https://www.inaturalist.org/taxa/${item.id}`, `${item.preferred_common_name || item.name} is listed as ${item.name}.${item.rank ? ` Rank: ${item.rank}.` : ""}`, "", 3)).filter(Boolean);
}

async function coinGeckoLookup(query) {
  if (!/\b(crypto|bitcoin|ethereum|coin|token price)\b/i.test(query)) return [];
  const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(topicSearchTerm(query, ["crypto", "coin", "token", "price"]))}`;
  const search = await fetchJson(searchUrl);
  const coin = search?.coins?.[0];
  if (!coin) return [];
  const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin.id)}&vs_currencies=usd`;
  const price = await fetchJson(priceUrl);
  return [apiCandidate(`CoinGecko: ${coin.name}`, `https://www.coingecko.com/en/coins/${coin.id}`, `${coin.name} (${coin.symbol}) price is ${price?.[coin.id]?.usd ? `$${price[coin.id].usd}` : "not available"} in USD.`, "", 4)];
}

async function worldBankLookup(query) {
  if (!/\b(gdp|population|economy|world bank|indicator)\b/i.test(query)) return [];
  const country = worldBankCountryCode(query);
  if (!country) return [];
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/SP.POP.TOTL?format=json&per_page=3`;
  const data = await fetchJson(url);
  return (data?.[1] || []).slice(0, 2).map((item) => apiCandidate(`World Bank: ${item.country?.value}`, url, `${item.country?.value} population in ${item.date}: ${item.value ? Number(item.value).toLocaleString() : "unknown"}.`, "population economy indicator", 3)).filter(Boolean);
}

async function universitiesLookup(query) {
  if (!/\b(university|college|school)\b/i.test(query)) return [];
  const url = `https://universities.hipolabs.com/search?name=${encodeURIComponent(topicSearchTerm(query, ["university", "college", "school"]))}`;
  const data = await fetchJson(url);
  return (data || []).slice(0, 3).map((item) => apiCandidate(`Universities: ${item.name}`, item.web_pages?.[0] || url, `${item.name} is in ${item.country}.${item.domains?.[0] ? ` Domain: ${item.domains[0]}.` : ""}`, "", 3)).filter(Boolean);
}

async function cratesLookup(query) {
  const name = packageSearchTerm(query, ["rust", "crate", "crates", "cargo"]);
  const exactUrl = `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`;
  const exact = await fetchJson(exactUrl);
  const exactCandidate = exact?.crate
    ? apiCandidate(`crates.io: ${exact.crate.name}`, `https://crates.io/crates/${exact.crate.name}`, `${exact.crate.name} latest stable version is ${exact.crate.max_stable_version || exact.crate.newest_version || "unknown"}.${exact.crate.description ? ` ${exact.crate.description}` : ""}`, "", 6)
    : null;
  const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(name)}&per_page=3`;
  const data = await fetchJson(url);
  const search = (data?.crates || [])
    .filter((item) => item.name !== exact?.crate?.name)
    .map((item) => apiCandidate(`crates.io: ${item.name}`, `https://crates.io/crates/${item.name}`, `${item.name} latest stable version is ${item.max_stable_version || item.newest_version || "unknown"}.${item.description ? ` ${item.description}` : ""}`, "", 3))
    .filter(Boolean);
  return [exactCandidate, ...search].filter(Boolean);
}

async function rubyGemsLookup(query) {
  const name = packageSearchTerm(query, ["ruby", "gem", "rubygems"]);
  const url = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(name)}`;
  const data = await fetchJson(url);
  return (data || []).slice(0, 3).map((item) => apiCandidate(`RubyGems: ${item.name}`, item.project_uri, `${item.name} latest version is ${item.version}.${item.info ? ` ${item.info.slice(0, 180)}` : ""}`, "", 3)).filter(Boolean);
}

async function packagistLookup(query) {
  const name = packageSearchTerm(query, ["php", "composer", "package", "packagist"]);
  const url = `https://packagist.org/search.json?q=${encodeURIComponent(name)}&per_page=3`;
  const data = await fetchJson(url);
  return (data?.results || []).map((item) => apiCandidate(`Packagist: ${item.name}`, item.url, `${item.name}.${item.description ? ` ${item.description}` : ""}`, "", 3)).filter(Boolean);
}

async function mavenLookup(query) {
  const name = packageSearchTerm(query, ["maven", "java", "library", "artifact"]);
  const url = `https://search.maven.org/solrsearch/select?q=${encodeURIComponent(name)}&rows=3&wt=json`;
  const data = await fetchJson(url);
  return (data?.response?.docs || []).map((item) => apiCandidate(`Maven Central: ${item.id}`, `https://search.maven.org/artifact/${item.g}/${item.a}`, `${item.id} latest version is ${item.latestVersion || "unknown"}.`, "", 3)).filter(Boolean);
}

async function nugetLookup(query) {
  const name = packageSearchTerm(query, ["nuget", "dotnet", ".net", "package"]);
  const url = `https://azuresearch-usnc.nuget.org/query?q=${encodeURIComponent(name)}&take=3`;
  const data = await fetchJson(url);
  return (data?.data || []).map((item) => apiCandidate(`NuGet: ${item.id}`, item.projectUrl || `https://www.nuget.org/packages/${item.id}`, `${item.id} latest version is ${item.version}.${item.description ? ` ${item.description.slice(0, 180)}` : ""}`, "", 3)).filter(Boolean);
}

async function dockerHubLookup(query) {
  const name = packageSearchTerm(query, ["docker", "image", "container", "hub"]);
  const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(name)}&page_size=3`;
  const data = await fetchJson(url);
  return (data?.results || []).map((item) => apiCandidate(`Docker Hub: ${item.repo_name}`, `https://hub.docker.com/r/${item.repo_name}`, `${item.repo_name}.${item.short_description ? ` ${item.short_description}` : ""} Stars: ${item.star_count || 0}.`, "", 3)).filter(Boolean);
}

async function homebrewLookup(query) {
  const name = packageSearchTerm(query, ["homebrew", "brew", "formula", "package"]).toLowerCase().match(/[a-z0-9.+-]+/)?.[0];
  if (!name) return [];
  const url = `https://formulae.brew.sh/api/formula/${encodeURIComponent(name)}.json`;
  const data = await fetchJson(url);
  if (!data?.name) return [];
  return [apiCandidate(`Homebrew: ${data.name}`, `https://formulae.brew.sh/formula/${data.name}`, `${data.name} latest stable version is ${data.versions?.stable || "unknown"}.${data.desc ? ` ${data.desc}` : ""}`, "", 3)];
}

function cleanXml(text) {
  return stripHtml(String(text).replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"));
}

function packageSearchTerm(query, removeWords) {
  const remove = new RegExp(`\\b(${removeWords.map(escapeRegExp).join("|")})\\b`, "gi");
  return cleanLookupQuery(query)
    .replace(remove, " ")
    .replace(/\s+/g, " ")
    .trim() || cleanLookupQuery(query);
}

async function minecraftWikiLookup(query) {
  if (query.toLowerCase().includes("fandom")) return [];
  if (!query.toLowerCase().includes("minecraft") && !/\brd-\d+\b|\brd\b/i.test(query)) return [];
  return mediaWikiLookup({
    query: query.replace(/\bminecraft\s+wiki\b/gi, "").replace(/\bminecraft\b/gi, "").trim() || query,
    api: "https://minecraft.wiki/api.php",
    title: "Minecraft Wiki",
    sourceBoost: 5,
  });
}

async function mediaWikiLookup({ query, api, title, sourceBoost = 0, introOnly = true }) {
  const searchParams = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "7",
    format: "json",
    origin: "*",
  });
  const searchResponse = await fetch(`${api}?${searchParams}`);
  if (!searchResponse.ok) throw new Error(`${title} search failed`);
  const searchData = await searchResponse.json();
  const hits = searchData.query?.search || [];
  const titles = hits.map((hit) => hit.title).filter(Boolean);
  if (!titles.length) return [];

  const pageParams = new URLSearchParams({
    action: "query",
    prop: "extracts|info",
    explaintext: "1",
    exchars: "900",
    inprop: "url",
    titles: titles.join("|"),
    format: "json",
    origin: "*",
  });
  if (introOnly) pageParams.set("exintro", "1");
  const pageResponse = await fetch(`${api}?${pageParams}`);
  if (!pageResponse.ok) throw new Error(`${title} page lookup failed`);
  const pageData = await pageResponse.json();
  const pages = Object.values(pageData.query?.pages || {});

  return pages
    .filter((page) => page.title && page.extract)
    .map((page) => {
      const hit = hits.find((item) => item.title === page.title);
      const snippet = cleanSnippet(hit?.snippet || page.extract);
      return {
        answer: page.extract,
        text: `${page.title} ${page.extract} ${snippet}`,
        sourceBoost,
        source: {
          title: `${title}: ${page.title}`,
          url: page.fullurl || page.canonicalurl || `${api}?title=${encodeURIComponent(page.title)}`,
          snippet,
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
  const candidateText = (candidate.text || candidate.answer || "").toLowerCase();
  const overlap = queryWords.filter((word) => textWords.has(word)).length;
  const sourceBonus = sourceScore(query, candidate) + (candidate.sourceBoost || 0);
  const lengthBonus = Math.min((candidate.text || "").length / 400, 1);
  const titleBonus = exactTitleMatch(query, candidate) ? 8 : 0;
  const exactPhraseBonus = importantPhrases(query)
    .filter((phrase) => candidateText.includes(phrase))
    .length * 4;
  return overlap * 3 + titleBonus + exactPhraseBonus + intentScore(query, candidateText) + sourceBonus + lengthBonus;
}

function exactTitleMatch(query, candidate) {
  const normalizedQuery = normalizeTitle(cleanLookupQuery(query));
  const title = candidate.source?.title || "";
  const normalizedTitle = normalizeTitle(title.includes(":") ? title.split(":").pop() : title);
  return normalizedQuery && normalizedTitle === normalizedQuery;
}

function intentScore(query, candidateText) {
  const lower = query.toLowerCase();
  let score = 0;
  if (isLinuxDriverQuestion(lower)) {
    const hasNvidia = candidateText.includes("nvidia");
    const hasLinuxDriver = /\b(linux|ubuntu|debian|arch|fedora|driver|drivers|nouveau|wayland|xorg|dkms|kernel)\b/.test(candidateText);
    if (hasNvidia && hasLinuxDriver) score += 18;
    if (!hasNvidia || !hasLinuxDriver) score -= 20;
  }
  if (isCpuComparisonQuestion(lower)) {
    if (/\b(amd|advanced micro devices|ryzen)\b/.test(candidateText)) score += 5;
    if (/\b(intel|core i[3579]|xeon)\b/.test(candidateText)) score += 5;
  }
  if (/\blast\b/.test(lower) && /\brd\b/.test(lower) && candidateText.includes("last archived version of pre-classic")) {
    score += 20;
  }
  if (/\blast\b/.test(lower) && !/\boldest\b/.test(lower) && candidateText.includes("oldest version")) {
    score -= 12;
  }
  return score;
}

function sourceScore(query, candidate) {
  const url = candidate.source?.url || "";
  const lower = query.toLowerCase();
  const text = `${candidate.source?.title || ""} ${candidate.text || ""} ${candidate.answer || ""}`.toLowerCase();
  const currentVersionIntent = lower.includes("minecraft") &&
    /\b(last|latest|current|newest)\b/.test(lower) &&
    !/\brd\b|pre-classic|historical|oldest/.test(lower);
  let score = 0;
  if (url.includes("wikipedia.org")) score += 1;
  if (/\b(nvidia|amd|intel)\b/.test(lower) && /\b(nvidia|advanced micro devices|amd|intel)\b/.test(text)) score += 6;
  if (url.includes("minecraft.wiki") && (lower.includes("minecraft") || /\brd\b/.test(lower))) score += 4;
  if (url.includes("mojang.com") && lower.includes("minecraft")) score += 5;
  if (url.includes("mojang.com") && currentVersionIntent) score += 10;
  if (url.includes("mcsrvstat.us") && /\b(server|ping|status)\b/.test(lower)) score += 12;
  if (url.includes("fandom.com") && lower.includes("fandom")) score += 20;
  if (url.includes("open-meteo.com") && /\b(weather|forecast|temperature|temp)\b/.test(lower)) score += 12;
  if (url.includes("dictionaryapi.dev") && /\b(define|definition|meaning)\b/.test(lower)) score += 10;
  if (url.includes("github.com") && lower.includes("github")) score += 10;
  if (url.includes("npmjs.com") && /\b(npm|node package)\b/.test(lower)) score += 10;
  if (url.includes("pypi.org") && /\b(pypi|python package|pip package)\b/.test(lower)) score += 10;
  if (url.includes("openlibrary.org") && /\b(book|author|novel|isbn)\b/.test(lower)) score += 8;
  if (url.includes("openstreetmap.org") && /\b(address|map|where is|location|coordinates|geocode)\b/.test(lower)) score += 10;
  if (url.includes("openlibrary.org") && exactTitleMatch(query, candidate)) score += 8;
  if (url.includes("tvmaze.com") && /\b(tv|show|episode|series)\b/.test(lower)) score += 10;
  if (url.includes("jikan.moe") && /\b(anime|manga|mal)\b/.test(lower)) score += 10;
  if (url.includes("musicbrainz.org") && /\b(artist|album|song|band|music)\b/.test(lower)) score += 10;
  if (url.includes("itunes.apple.com") && /\b(itunes|app|podcast|song|album|movie)\b/.test(lower)) score += 10;
  if (url.includes("openfoodfacts.org") && /\b(food|barcode|nutrition|calories|ingredient)\b/.test(lower)) score += 10;
  if ((url.includes("gbif.org") || url.includes("inaturalist.org")) && /\b(species|taxonomy|plant|animal|genus|biology|wildlife|nature)\b/.test(lower)) score += 10;
  if (url.includes("coingecko.com") && /\b(crypto|bitcoin|ethereum|coin|token price)\b/.test(lower)) score += 10;
  if (url.includes("worldbank.org") && /\b(gdp|population|economy|world bank|indicator)\b/.test(lower)) score += 10;
  if (url.includes("hipolabs.com") && /\b(university|college|school)\b/.test(lower)) score += 10;
  if (url.includes("archlinux.org") && /\b(arch|archlinux|pacman|install|package|desktop|linux)\b/.test(lower)) score += 18;
  if (url.includes("system76.com") && /\b(cosmic|desktop|install|linux)\b/.test(lower)) score += 10;
  if ((url.includes("semanticscholar.org") || url.includes("openalex.org") || url.includes("crossref.org") || url.includes("arxiv.org")) && /\b(paper|research|study|journal)\b/.test(lower)) score += 8;
  if (url.includes("pokeapi.co") && /\b(pokemon|pokémon|pokedex)\b/.test(lower)) score += 15;
  if (isPackageSource(url) && /\b(crate|package|library|gem|maven|nuget|docker|brew|cargo|composer)\b/.test(lower)) score += 12;
  return score;
}

function isPackageSource(url) {
  return /crates\.io|rubygems\.org|packagist\.org|maven\.org|nuget\.org|docker\.com|formulae\.brew\.sh|npmjs\.com|pypi\.org/.test(url);
}

function isStructuredSource(url) {
  return /pokeapi\.co|openstreetmap\.org|api\.mcsrvstat\.us|api\.open-meteo\.com|api\.github\.com|wikidata\.org|tvmaze\.com|jikan\.moe|musicbrainz\.org|itunes\.apple\.com|openfoodfacts\.org|gbif\.org|inaturalist\.org|coingecko\.com|worldbank\.org|hipolabs\.com|archlinux\.org|system76\.com/.test(url);
}

function structuredIntentSatisfied(query, best) {
  const url = best.source?.url || "";
  const lower = query.toLowerCase();

  if (url.includes("pokeapi.co") && /\b(pokemon|pokémon|pokedex)\b/.test(lower)) return true;
  if (url.includes("openstreetmap.org") && /\b(address|map|where is|location|located|coordinates|coordinate|geocode)\b/.test(lower)) return true;
  if (url.includes("api.mcsrvstat.us") && /\b(minecraft|mc|server|ping|status)\b/.test(lower)) return true;
  if (url.includes("api.open-meteo.com") && /\b(weather|forecast|temperature|temp)\b/.test(lower)) return true;
  if (url.includes("api.github.com") && /\b(github|repo|repository|user|stars|forks)\b/.test(lower)) return true;
  if (url.includes("tvmaze.com") && /\b(tv|show|episode|series)\b/.test(lower)) return true;
  if (url.includes("jikan.moe") && /\b(anime|manga|mal)\b/.test(lower)) return true;
  if (url.includes("musicbrainz.org") && /\b(artist|album|song|band|music)\b/.test(lower)) return true;
  if (url.includes("itunes.apple.com") && /\b(itunes|app|podcast|song|album|movie)\b/.test(lower)) return true;
  if (url.includes("openfoodfacts.org") && /\b(food|barcode|nutrition|calories|ingredient)\b/.test(lower)) return true;
  if ((url.includes("gbif.org") || url.includes("inaturalist.org")) && /\b(species|taxonomy|plant|animal|genus|biology|wildlife|nature)\b/.test(lower)) return true;
  if (url.includes("coingecko.com") && /\b(crypto|bitcoin|ethereum|coin|token price)\b/.test(lower)) return true;
  if (url.includes("worldbank.org") && /\b(gdp|population|economy|world bank|indicator)\b/.test(lower)) return true;
  if (url.includes("hipolabs.com") && /\b(university|college|school)\b/.test(lower)) return true;
  if (url.includes("archlinux.org") && /\b(arch|archlinux|pacman|install|package|desktop|linux)\b/.test(lower)) return true;
  if (url.includes("system76.com") && /\b(cosmic|desktop|install|linux)\b/.test(lower)) return true;
  if (url.includes("wikidata.org") && scoreCandidate(query, best) >= 8) return true;

  return false;
}

function importantPhrases(query) {
  const lower = query.toLowerCase();
  const oldVersionIntent = /\brd\b|pre-classic|historical|oldest/.test(lower);
  const phrases = [];
  if (lower.includes("minecraft") && lower.includes("launcher")) phrases.push("minecraft launcher");
  if (oldVersionIntent && lower.includes("available")) phrases.push("available in the minecraft launcher");
  if (/\brd\b/.test(lower)) {
    phrases.push("rd-");
    if (lower.includes("last")) phrases.push("last archived version of pre-classic");
  }
  return phrases;
}

function keywords(text) {
  const stop = new Set(["the", "and", "for", "you", "that", "this", "with", "what", "when", "where", "who", "are", "is", "of", "a", "an", "to", "in"]);
  return String(text).toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => !stop.has(word)) || [];
}

function lookupQueries(message) {
  const clean = cleanLookupQuery(message);
  const lowered = clean.toLowerCase();
  const memoryTopic = memoryTopicText();
  const followUp = memoryTopic && looksLikeFollowUp(clean);
  const baseQuery = followUp ? `${memoryTopic} ${clean}` : clean;
  const queries = [
    baseQuery,
    clean,
    clean
      .replace(/\b(go|look|check)\s+(on|at)\s+.+?\s+for\s+help\.?/i, "")
      .replace(/\bofficial\b/gi, "")
      .trim(),
  ];

  if (followUp) {
    queries.push(`${memoryTopic} ${clean} troubleshooting`);
    queries.push(`${memoryTopic} advanced troubleshooting`);
    queries.push(`${memoryTopic} after basic troubleshooting`);
    queries.push(`${memoryTopic} next steps`);
  }

  for (const expanded of genericProblemQueries(clean)) {
    queries.push(expanded);
  }

  if (lowered.includes("minecraft")) {
    queries.push(clean.replace(/\b(on|from)\s+the\s+minecraft\s+wiki\b/gi, "").trim());
    queries.push(`${clean} Minecraft Wiki`);
  }

  if (lowered.includes("minecraft") && lowered.includes("launcher")) {
    queries.push("Minecraft Launcher version_manifest latest release");
  }

  if (lowered.includes("minecraft") && lowered.includes("launcher") && /\brd\b/.test(lowered)) {
    queries.push("\"available in the Minecraft Launcher\" rd");
    queries.push("pre-Classic versions available in the Minecraft Launcher rd");
    if (lowered.includes("last")) {
      queries.push("last rd pre-Classic launcher");
      queries.push("last archived version pre-Classic launcher rd");
    }
  }

  if (isLinuxDriverQuestion(lowered)) {
    queries.push("NVIDIA Linux drivers proprietary Nouveau Wayland DKMS kernel");
    queries.push("NVIDIA Linux driver controversy proprietary open source Nouveau");
    queries.push("NVIDIA drivers Linux Wayland proprietary driver issues");
  }

  if (isCpuComparisonQuestion(lowered)) {
    queries.push("AMD vs Intel CPU comparison Ryzen Core processors");
    queries.push("AMD Ryzen Intel Core CPU comparison performance power price");
  }

  return uniqueStrings(queries.filter(Boolean)).slice(0, 12);
}

function cleanLookupQuery(message) {
  return message
    .replace(/^(look up|search for|search|what is|what are|who is|who are|tell me about)\s+/i, "")
    .trim() || message.trim();
}

function topicSearchTerm(query, removeWords) {
  const remove = new RegExp(`\\b(${removeWords.map(escapeRegExp).join("|")})\\b`, "gi");
  return cleanLookupQuery(query)
    .replace(remove, " ")
    .replace(/\b(for|about|called|named|info|information|lookup|search|find|the|a|an|of|on)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || cleanLookupQuery(query);
}

function worldBankCountryCode(query) {
  const raw = topicSearchTerm(query, ["world", "bank", "population", "gdp", "economy", "indicator", "country", "for", "of", "in"]);
  const normalized = normalizeTitle(raw);
  const codes = {
    "united states": "US",
    "usa": "US",
    "us": "US",
    "america": "US",
    "united kingdom": "GB",
    "uk": "GB",
    "great britain": "GB",
    "france": "FR",
    "germany": "DE",
    "japan": "JP",
    "canada": "CA",
    "mexico": "MX",
    "china": "CN",
    "india": "IN",
    "brazil": "BR",
    "australia": "AU",
    "russia": "RU",
  };
  if (/^[a-z]{2,3}$/i.test(raw.trim())) return raw.trim().toUpperCase();
  return codes[normalized] || "";
}

function cleanSnippet(snippet) {
  const template = document.createElement("template");
  template.innerHTML = snippet;
  return (template.content.textContent || snippet).replace(/\s+/g, " ").trim();
}

function stripHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return (template.content.textContent || html).replace(/\s+/g, " ").trim();
}

function decodeHtml(html) {
  return stripHtml(html);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = source.url || source.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function genericProblemQueries(query) {
  const lower = query.toLowerCase();
  const terms = importantTerms(query).slice(0, 8).join(" ");
  const queries = [];

  if (isProblemRequest(lower)) {
    queries.push(`${terms} troubleshooting`);
    queries.push(`${terms} common causes`);
    queries.push(`${terms} fix`);
  }

  if (/\b(pc|computer|desktop|motherboard|gpu|cpu)\b/.test(lower) && /\b(turn on|boot|display|screen|post|power|signal)\b/.test(lower)) {
    queries.push("pc wont turn on");
    queries.push("computer not booting");
    queries.push("computer powers on no display");
    queries.push("new pc no display no beeps");
  }

  if (/\b(bios|uefi)\b/.test(lower) && /\b(f1|f2|continue|setup|reset|screen|message)\b/.test(lower)) {
    queries.push("BIOS reset press F1 F2 continue setup");
    queries.push("BIOS reset screen press F2 continue");
  }

  const errorText = quotedText(query) || visibleErrorText(query);
  if (errorText) {
    queries.push(`${errorText} meaning`);
    queries.push(`${errorText} troubleshooting`);
  }

  const hardware = hardwareTerms(query);
  if (hardware.length) {
    queries.push(`${hardware.join(" ")} troubleshooting`);
    queries.push(`${hardware.join(" ")} known issues`);
  }

  if (/\b(nvidia|amd|intel|linux|driver|drivers|cpu|gpu)\b/.test(lower) && /\b(why|controversial|controversy|better|worse|vs|versus|compare|comparison)\b/.test(lower)) {
    queries.push(`${hardware.join(" ") || importantTerms(query).slice(0, 5).join(" ")} explanation`);
    queries.push(`${hardware.join(" ") || importantTerms(query).slice(0, 5).join(" ")} comparison`);
  }

  const product = productTerms(query);
  if (product.length && isProblemRequest(lower)) {
    queries.push(`${product.join(" ")} support troubleshooting`);
  }

  return queries;
}

function isProblemRequest(lower) {
  return /\b(won't|wont|will not|can't|cant|cannot|doesn't|doesnt|not working|not work|work well|broken|error|issue|problem|trouble|fix|help|stuck|crash|crashing|offline|failed|failure|no display|no signal|not booting|turn on|boot|bios reset|setup screen)\b/.test(lower);
}

function importantTerms(text) {
  const stop = new Set([
    "with", "that", "this", "have", "has", "the", "and", "but", "from", "into", "onto", "says",
    "press", "please", "help", "need", "what", "when", "where", "while", "there", "here", "my",
  ]);
  return String(text).toLowerCase()
    .match(/[a-z0-9.+-]{2,}/g)
    ?.filter((word) => !stop.has(word))
    .filter((word, index, arr) => arr.indexOf(word) === index) || [];
}

function hardwareTerms(text) {
  return importantTerms(text).filter((word) => (
    /^(rtx|gtx|rx|ryzen|intel|amd|nvidia|radeon|ddr|bios|uefi|cpu|gpu|ram|ssd|hdd|nvme|motherboard|psu)$/.test(word) ||
    /^[a-z]*\d{3,5}[a-z0-9-]*$/.test(word)
  ));
}

function productTerms(text) {
  return importantTerms(text).filter((word) => /[0-9]/.test(word) || word.length > 5).slice(0, 5);
}

function visibleErrorText(text) {
  const match = String(text).match(/\b(error|screen|message|says|code)\b[:\s-]+(.{4,120})$/i);
  return match?.[2]?.replace(/\s+/g, " ").trim() || "";
}

function pokedexNumber(query) {
  const lower = query.toLowerCase();
  if (!/\b(pokemon|pokémon|pokedex)\b/.test(lower)) return null;
  const numeric = lower.match(/\b(\d+)(?:st|nd|rd|th)?\b/)?.[1];
  if (numeric) return Number(numeric);
  const ordinals = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
    eleventh: 11,
    twelfth: 12,
    thirteenth: 13,
    fourteenth: 14,
    fifteenth: 15,
    sixteenth: 16,
    seventeenth: 17,
    eighteenth: 18,
    nineteenth: 19,
    twentieth: 20,
  };
  const word = lower.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)\b/)?.[1];
  return word ? ordinals[word] : null;
}

function capitalize(text) {
  return String(text).charAt(0).toUpperCase() + String(text).slice(1);
}

function looksLikeFollowUp(text) {
  const lower = text.toLowerCase();
  return text.length < 160 && (
    /^(it|that|this|now|still|also|actually|no|yes|ok|okay|none|nothing|neither)\b/.test(lower) ||
    /\b(f1|f2|continue|setup|error|screen|message|same|different|instead|now|worked|work|didn't|didnt|doesn't|doesnt|failed|next)\b/.test(lower)
  );
}

function memoryTopicText() {
  const recent = tempMemory.slice(-4).reverse().find((item) => item.user && item.intent !== "general");
  return recent?.user || "";
}

function composeAnswer(query, best, candidates = []) {
  const lower = query.toLowerCase();
  const sourceCount = uniqueSources(candidates.map((candidate) => candidate.source)).length;
  const subject = answerSubject(query, best);
  const facts = collectFacts(candidates);

  if (best.source?.url?.includes("mcsrvstat.us")) {
    return friendlyServerAnswer(best.answer);
  }

  if (best.source?.url?.includes("pokeapi.co")) {
    return best.source.snippet || plainFact(cleanFact(best.answer));
  }

  if (best.source?.url?.includes("openstreetmap.org")) {
    return best.source.snippet || plainFact(cleanFact(best.answer));
  }

  if (isPackageSource(best.source?.url || "")) {
    return best.source.snippet || plainFact(cleanFact(best.answer));
  }

  if ((best.source?.url || "").includes("archlinux.org")) {
    return best.answer;
  }

  if (isLinuxDriverQuestion(lower)) {
    return composeLinuxDriverAnswer(query, candidates);
  }

  if (isCpuComparisonQuestion(lower)) {
    return composeCpuComparisonAnswer(query, candidates);
  }

  if (isProblemRequest(lower) && candidates.some(isStackExchangeCandidate)) {
    return composeProblemAnswer(query, candidates);
  }

  if (/^(what is|what are|who is|who are|tell me about)\b/i.test(query) || facts.length) {
    const first = facts[0] || cleanFact(best.answer);
    const second = facts.find((fact) => fact !== first && !tooSimilar(fact, first));
    let firstPlain = plainFact(first);
    if (subject && normalizeTitle(firstPlain).startsWith(`${normalizeTitle(subject)} `)) {
      const withoutCopula = firstPlain.replace(new RegExp(`^${escapeRegExp(subject)}\\s+(is|are|means)\\s+`, "i"), "");
      if (withoutCopula !== firstPlain) {
        firstPlain = `${subject} is ${withoutCopula}`;
      }
    }
    if (subject && firstPlain.startsWith(`(${subject.toUpperCase()}) `)) {
      firstPlain = `${subject.toUpperCase()} ${firstPlain.slice(subject.length + 3)}`;
    }
    if (subject && /^(is|are)\b/i.test(firstPlain)) {
      firstPlain = `${subject} ${firstPlain}`;
    }
    let answer = firstPlain;
    if (second && sourceCount > 1) {
      answer += ` ${plainFact(second)}`;
    }
    if (sourceCount > 1) {
      answer += ` I pulled that together from ${sourceCount} sources.`;
    }
    return answer;
  }

  if (lower.includes("how") || lower.includes("why")) {
    const extra = facts.find((fact) => !tooSimilar(fact, best.answer || ""));
    return extra
      ? `Here’s the useful part: ${plainFact(cleanFact(best.answer))} ${plainFact(extra)}`
      : `Here’s the useful part: ${plainFact(cleanFact(best.answer))}`;
  }

  return plainFact(cleanFact(best.answer));
}

function isStackExchangeCandidate(candidate) {
  return /stackoverflow|superuser|serverfault/i.test(candidate.source?.title || candidate.source?.url || "");
}

function isLinuxDriverQuestion(lower) {
  return /\b(linux|ubuntu|debian|arch|fedora)\b/.test(lower) && /\b(nvidia|driver|drivers|gpu|graphics)\b/.test(lower);
}

function composeLinuxDriverAnswer(query, candidates) {
  const relevant = candidates.filter((candidate) => {
    const text = `${candidate.source?.title || ""} ${candidate.text || ""} ${candidate.answer || ""}`.toLowerCase();
    return text.includes("nvidia") && /\b(linux|ubuntu|debian|arch|fedora|driver|drivers|nouveau|wayland|xorg|dkms|kernel)\b/.test(text);
  });
  const usable = relevant.length ? relevant : candidates;
  const sourceCount = uniqueSources(usable.map((candidate) => candidate.source)).length;
  const text = usable.map((candidate) => `${candidate.source?.title || ""} ${candidate.text || ""}`).join(" ").toLowerCase();
  const themes = [];
  if (/\b(proprietary|closed source|binary blob|nouveau|open source)\b/.test(text)) themes.push("NVIDIA has historically depended on a proprietary driver stack while Linux desktops often expect open, kernel-integrated drivers");
  if (/\b(kernel|dkms|module|headers)\b/.test(text)) themes.push("kernel updates can break or delay the NVIDIA kernel module until DKMS/modules rebuild correctly");
  if (/\b(wayland|xorg|x11|compositor)\b/.test(text)) themes.push("display-server differences such as Wayland versus Xorg can expose driver bugs or missing features");
  if (/\b(secure boot|signed|signature)\b/.test(text)) themes.push("Secure Boot can block unsigned NVIDIA modules on some systems");
  if (/\b(hybrid|optimus|prime|intel|amd)\b/.test(text)) themes.push("hybrid laptop graphics adds another layer because the system has to switch between GPUs cleanly");

  const useful = uniqueStrings(themes).slice(0, 4);
  if (!useful.length) {
    return `I found Linux/NVIDIA sources, but they were too scattered to make a clean explanation. The short version is that NVIDIA support depends heavily on the exact distro, kernel, desktop session, and driver branch.`;
  }

  return `The short version: NVIDIA drivers can be rough on Linux because ${joinNatural(useful)}. I checked ${sourceCount || candidates.length} sources and the pattern is not “Linux cannot do NVIDIA”; it is that NVIDIA’s driver path has more moving pieces than AMD/Intel on many distros.`;
}

function isCpuComparisonQuestion(lower) {
  return /\b(amd|intel)\b/.test(lower) &&
    /\b(cpu|cpus|processor|processors)\b/.test(lower) &&
    /\b(better|worse|vs|versus|compare|comparison|than|then)\b/.test(lower);
}

function composeCpuComparisonAnswer(query, candidates) {
  const sourceCount = uniqueSources(candidates.map((candidate) => candidate.source)).length;
  const text = candidates.map((candidate) => `${candidate.source?.title || ""} ${candidate.text || ""}`).join(" ").toLowerCase();
  const hasAmd = /\b(amd|advanced micro devices|ryzen)\b/.test(text);
  const hasIntel = /\b(intel|core i[3579]|xeon)\b/.test(text);

  if (hasAmd && hasIntel) {
    return `AMD is not automatically better than Intel, and Intel is not automatically better than AMD. For CPUs, the better choice depends on the exact models, price, power use, motherboard platform, and what you do most: gaming, streaming, compiling code, editing, or general use. I checked ${sourceCount || candidates.length} sources; the useful answer is to compare the specific Ryzen and Intel Core chips you are choosing between, not just the brand names.`;
  }

  return `For CPUs, AMD vs Intel depends on the exact chip models and prices. Brand alone is not enough to call one better. Compare the specific Ryzen and Intel Core CPUs by benchmark, power use, motherboard cost, and your workload.`;
}

function composeProblemAnswer(query, candidates) {
  const stackCandidates = candidates.filter(isStackExchangeCandidate);
  const sourceCount = uniqueSources(stackCandidates.map((candidate) => candidate.source)).length;
  const titles = stackCandidates.map((candidate) => candidate.source?.title || "").join(" ").toLowerCase();
  const text = stackCandidates.map((candidate) => `${candidate.source?.title || ""} ${candidate.text || ""}`).join(" ").toLowerCase();
  const themes = [];

  if (/\b(power|psu|turn on|wont turn|won't turn)\b/.test(text)) themes.push("power delivery");
  if (/\b(display|monitor|screen|no signal|black screen)\b/.test(text)) themes.push("display/GPU output");
  if (/\b(boot|bios|uefi|startup|setup)\b/.test(text)) themes.push("BIOS/boot setup");
  if (/\b(disk|drive|hdd|ssd|sata|nvme)\b/.test(text)) themes.push("drive or cable detection");
  if (/\b(beep|beeps|ram|memory)\b/.test(text)) themes.push("RAM or motherboard POST checks");
  if (/\b(driver|nvidia|amd|graphics)\b/.test(text)) themes.push("graphics driver or GPU troubleshooting");

  const uniqueThemes = uniqueStrings(themes);
  if (!uniqueThemes.length) {
    return `I found similar troubleshooting threads, but they do not line up cleanly enough for a confident fix. The closest matches are ${summarizeTitles(stackCandidates)}.`;
  }

  const exactNote = requiredKeywords(query).some((word) => !text.includes(word))
    ? "I did not find an exact match for every part/model you named, so treat this as a best-match troubleshooting path, not a diagnosis."
    : "The sources line up pretty well with your symptoms.";

  const followUp = /^(none|nothing|neither)\b|\b(didn't|didnt|still|failed)\b/i.test(query);
  const lead = followUp
    ? `Since the first pass did not work, I checked ${sourceCount || stackCandidates.length} next-step troubleshooting sources.`
    : `I checked ${sourceCount || stackCandidates.length} troubleshooting sources.`;
  return `${lead} The common pattern is ${joinNatural(uniqueThemes)}. ${exactNote} The next useful move is to isolate which stage fails: power, POST, display, BIOS, or boot drive. Change one thing at a time and use what changes on screen/fans/debug lights to narrow it down.`;
}

function summarizeTitles(candidates) {
  return candidates
    .slice(0, 3)
    .map((candidate) => candidate.source?.title?.replace(/^(superuser|stackoverflow|serverfault):\s*/i, "") || "")
    .filter(Boolean)
    .join("; ");
}

function joinNatural(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function mismatchReason(query, best, score) {
  const required = requiredKeywords(query);
  const text = `${best.text || ""} ${best.answer || ""} ${best.source?.title || ""}`.toLowerCase();
  const missing = required.filter((word) => !text.includes(word));
  const hasSpecificToken = required.some((word) => /[0-9]/.test(word) || word.length >= 6);
  const problemSource = isProblemRequest(query.toLowerCase()) && /stackexchange|stackoverflow|superuser|serverfault/i.test(best.source?.title || best.source?.url || "");
  const packageSource = isPackageSource(best.source?.url || "") && required.some((word) => text.includes(word));
  const structuredSource = isStructuredSource(best.source?.url || "") && (
    !required.length ||
    required.some((word) => text.includes(word)) ||
    structuredIntentSatisfied(query, best)
  );
  const explanatorySource = isExplanationQuestion(query) && entityOverlap(query, text) >= 1 && score >= 5;
  const comparisonSource = isComparisonQuestion(query) && entityOverlap(query, text) >= 1 && score >= 5;

  if (problemSource && problemOverlap(query, text) >= 2) {
    return "";
  }

  if (packageSource || structuredSource || explanatorySource || comparisonSource) {
    return "";
  }

  if ((score < 5 && !exactTitleMatch(query, best)) || (hasSpecificToken && missing.length)) {
    const terms = missing.length ? missing.join(", ") : required.join(", ");
    return `I found nearby-looking results, but they did not actually match ${terms}. ${suggestBetterQuery(query)}`;
  }

  if (required.length >= 2 && missing.length >= Math.ceil(required.length / 2)) {
    return `I found sources around the topic, but not enough of the important words matched. ${suggestBetterQuery(query)}`;
  }

  return "";
}

function problemOverlap(query, text) {
  const problemWords = ["pc", "computer", "desktop", "boot", "turn", "power", "display", "screen", "bios", "setup", "reset", "error", "problem", "issue"];
  return problemWords.filter((word) => query.toLowerCase().includes(word) && text.includes(word)).length;
}

function isExplanationQuestion(query) {
  const lower = query.toLowerCase();
  return /\b(why|how come|reason|reasons|controversial|controversy|debate|debated|issue|issues)\b/.test(lower);
}

function isComparisonQuestion(query) {
  const lower = query.toLowerCase();
  return /\b(better|worse|best|vs|versus|compare|comparison|than|then)\b/.test(lower);
}

function entityOverlap(query, text) {
  const terms = importantTerms(query)
    .filter((word) => !isSoftQueryWord(word))
    .filter((word) => word.length >= 3 || /\d/.test(word));
  return terms.filter((word) => text.includes(word)).length;
}

function normalizeTitle(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectFacts(candidates) {
  const facts = [];
  for (const candidate of candidates.slice(0, 5)) {
    for (const sentence of sentenceParts(candidate.answer || candidate.text || "")) {
      const fact = cleanFact(sentence);
      if (fact.length > 35 && fact.length < 260 && !facts.some((existing) => tooSimilar(existing, fact))) {
        facts.push(fact);
      }
      if (facts.length >= 3) return facts;
    }
  }
  return facts;
}

function sentenceParts(text) {
  return String(text)
    .replace(/==[^=]+==/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

function cleanFact(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .trim();
}

function plainFact(text) {
  return text
    .replace(/the art, application, and practice of creating images by recording light/i, "making images by capturing light")
    .replace(/either electronically by means of an image sensor, or chemically by means of a light-sensitive material such as photographic film/i, "using either a digital sensor or light-sensitive film")
    .replace(/^(.+?) is a /i, "$1 is basically a ")
    .replace(/^(.+?) is an /i, "$1 is basically an ")
    .replace(/^(.+?) are /i, "$1 are basically ")
    .trim();
}

function answerSubject(query, best) {
  const sourceTitle = best.source?.title || "";
  const afterColon = sourceTitle.includes(":") ? sourceTitle.split(":").pop().trim() : sourceTitle.trim();
  if (afterColon && !/duckduckgo|wikidata|wikipedia|api/i.test(afterColon)) return afterColon;
  return cleanLookupQuery(query).replace(/[?.!]+$/g, "");
}

function tooSimilar(a, b) {
  const aWords = new Set(keywords(a));
  const bWords = new Set(keywords(b));
  if (!aWords.size || !bWords.size) return false;
  const overlap = [...aWords].filter((word) => bWords.has(word)).length;
  return overlap / Math.min(aWords.size, bWords.size) > 0.75;
}

function requiredKeywords(query) {
  const lower = query.toLowerCase();
  const soft = new Set([
    "minecraft", "server", "version", "liked", "most", "best", "what", "who", "where", "when",
    "how", "why", "wiki", "fandom", "lookup", "search", "find", "tell", "about", "bar",
    "paper", "research", "study", "journal", "coordinates", "coordinate", "location", "address",
    "anime", "manga", "pokemon", "pokedex", "crate", "package", "library",
    "driver", "drivers", "work", "linux",
    "inside", "outside", "within", "into", "onto", "from", "ever", "locate", "located",
    "called", "named", "show", "give", "get", "please", "exactly", "available",
    "using", "use", "used", "controversial", "controversy", "debate", "debated", "reason", "reasons",
    "better", "worse", "than", "then", "vs", "versus", "compare", "comparison", "cpu", "cpus",
    "processor", "processors", "for",
  ]);
  return keywords(lower)
    .filter((word) => !soft.has(word))
    .filter((word) => !isOrdinalToken(word))
    .filter((word) => word.length >= 4 || /\d/.test(word));
}

function isSoftQueryWord(word) {
  const soft = new Set([
    "what", "who", "where", "when", "how", "why", "using", "use", "used", "controversial",
    "controversy", "debate", "debated", "reason", "reasons", "better", "worse", "than",
    "then", "versus", "compare", "comparison", "best", "most", "for", "with", "about",
    "cpu", "cpus", "processor", "processors", "driver", "drivers", "work", "working",
  ]);
  return soft.has(word) || isOrdinalToken(word);
}

function suggestBetterQuery(query) {
  const lower = query.toLowerCase();
  const cleaned = cleanLookupQuery(query).replace(/[?.!]+$/g, "").trim();

  if (/\b(minecraft|mc)\s+server|server\s+(status|ping)|ping\b/.test(lower)) {
    return "Try: `ping minecraft server play.example.com`.";
  }
  if (/\bweather|forecast|temperature|temp\b/.test(lower)) {
    return "Try: `weather for New York` or `forecast for London`.";
  }
  if (/\bpokemon|pokémon|pokedex\b/.test(lower)) {
    return "Try: `pokemon pikachu` or `2nd pokemon in pokedex`.";
  }
  if (/\bcoordinates|coordinate|where is|location|located|address|map\b/.test(lower)) {
    return "Try: `where is Eiffel Tower coordinates`.";
  }
  if (/\bgithub|github\.com\b/.test(lower)) {
    return "Try: `github user torvalds` or `github repo microsoft/vscode`.";
  }
  if (/\bnpm|pypi|python package|pip package|rust crate|crate|rubygems|ruby gem|packagist|maven|nuget|docker image|homebrew|brew\b/.test(lower)) {
    return "Try naming the package system, like `npm package react`, `pypi package requests`, or `rust crate serde`.";
  }
  if (/\bfandom\b/.test(lower)) {
    return "Try: `minecraft fandom creeper` or `terraria fandom guide`.";
  }
  if (/\bminecraft\b/.test(lower)) {
    return "Try: `minecraft wiki creeper` or `latest minecraft launcher version`.";
  }
  if (/\barch|archlinux|arch linux|pacman\b/.test(lower)) {
    return "Try: `cosmic desktop install guide arch linux` or `arch package cosmic`.";
  }
  if (/\bbook|novel|author|isbn\b/.test(lower)) {
    return "Try: `book Dune` or `author Ursula Le Guin`.";
  }
  if (/\btv|show|episode|series\b/.test(lower)) {
    return "Try: `tv show Breaking Bad`.";
  }
  if (/\banime|manga|mal\b/.test(lower)) {
    return "Try: `anime Fullmetal Alchemist`.";
  }
  if (/\bartist|album|song|band|music|itunes\b/.test(lower)) {
    return "Try: `music artist Daft Punk` or `itunes song Hey Jude`.";
  }
  if (/\bfood|barcode|nutrition|calories|ingredient\b/.test(lower)) {
    return "Try: `food Nutella` or `nutrition Coca-Cola`.";
  }
  if (/\bspecies|taxonomy|plant|animal|genus|biology|wildlife|nature\b/.test(lower)) {
    return "Try: `species monarch butterfly`.";
  }
  if (/\bcrypto|bitcoin|ethereum|coin|token price\b/.test(lower)) {
    return "Try: `crypto bitcoin price`.";
  }
  if (/\bpopulation|gdp|economy|world bank|indicator\b/.test(lower)) {
    return "Try: `world bank population United States`.";
  }
  if (/\buniversity|college|school\b/.test(lower)) {
    return "Try: `university Harvard`.";
  }
  if (isProblemRequest(lower)) {
    return `Try describing the symptom and device together, like \`${cleaned} troubleshooting\`.`;
  }

  return "Try adding the type of thing you mean, like `wiki`, `player`, `server`, `package`, `book`, `movie`, or `company`.";
}

function isOrdinalToken(word) {
  return /^(?:\d+)(?:st|nd|rd|th)?$/.test(word) ||
    /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|last|latest|newest|oldest|earliest)$/.test(word);
}

function friendlyServerAnswer(answer) {
  return answer
    .replace(/^(.+?) is online\. It is running (.+?) at (.+?) with (.+?)\./, "$1 is online. It is running $2 with $4.")
    .replace("appears to be offline or unreachable from the public ping API", "looks offline from the public ping API");
}

function loadTempMemory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOWFRAME_MEMORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(-LOWFRAME_MEMORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function saveTempMemory() {
  try {
    localStorage.setItem(LOWFRAME_MEMORY_KEY, JSON.stringify(tempMemory.slice(-LOWFRAME_MEMORY_LIMIT)));
  } catch {
    // Private browsing or storage limits should not break chat.
  }
}

function rememberTurn(userMessage, response) {
  rememberContext({
    role: "turn",
    user: userMessage,
    ai: response.answer,
    intent: classifyIntent(userMessage, response),
    sources: (response.sources || []).map((source) => source.url).slice(0, 4),
  });
}

function rememberContext(item) {
  tempMemory.push({ ...item, at: Date.now() });
  tempMemory = tempMemory.slice(-LOWFRAME_MEMORY_LIMIT);
  saveTempMemory();
}

function lastMemory() {
  return tempMemory[tempMemory.length - 1] || null;
}

function classifyIntent(message, response = {}) {
  const lower = message.toLowerCase();
  if (extractServerAddress(message) || response.sources?.some((source) => source.url?.includes("mcsrvstat.us"))) {
    return "minecraft_server";
  }
  if (isProblemRequest(lower)) return "problem";
  if (lower.includes("minecraft")) return "minecraft";
  return "general";
}

function isMinecraftPopularityQuestion(lower) {
  return lower.includes("minecraft") &&
    /\b(version|release|update)\b/.test(lower) &&
    /\b(liked|favorite|favourite|popular|best|everyone)\b/.test(lower);
}

function extractServerAddress(query) {
  const direct = String(query).match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})(?::\d{2,5})?\b/i)?.[0];
  if (direct) return direct;

  const cleaned = query
    .replace(/^https?:\/\//i, "")
    .replace(/\b(minecraft|mc|java|bedrock|server|status|ping|check|is|online|offline|for|of|the|a|an)\b/gi, " ");
  const address = cleaned.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})(?::\d{2,5})?\b/i)?.[0];
  return address || "";
}

function fandomRequestInfo(query) {
  const lower = query.toLowerCase();
  if (!lower.includes("fandom")) return null;

  const urlSlug = lower.match(/\b([a-z0-9-]+)\.fandom\.com\b/)?.[1];
  const namedSlug =
    lower.match(/\b(?:on|from|in|search|check)\s+([a-z0-9-]+)\s+(?:fandom|fandom wiki)\b/)?.[1] ||
    lower.match(/\b([a-z0-9-]+)\s+(?:fandom|fandom wiki)\b/)?.[1];
  const known = [
    ["minecraft", "minecraft"],
    ["terraria", "terraria"],
    ["roblox", "roblox"],
    ["fallout", "fallout"],
    ["elder scrolls", "elderscrolls"],
    ["zelda", "zelda"],
    ["star wars", "starwars"],
    ["marvel", "marvel"],
    ["dc", "dc"],
    ["pokemon", "pokemon"],
  ].find(([name]) => lower.includes(name))?.[1];
  const slug = urlSlug || known || namedSlug;
  if (!slug || ["fandom", "wiki", "about"].includes(slug)) return null;

  const search = query
    .replace(/https?:\/\/[a-z0-9-]+\.fandom\.com\/?\S*/gi, "")
    .replace(/\b(?:on|from|in|search|check)\s+[a-z0-9-]+\s+(?:fandom|fandom wiki)\b/gi, "")
    .replace(/\b[a-z0-9-]+\s+(?:fandom|fandom wiki)\b/gi, "")
    .replace(/\bfandom\b/gi, "")
    .replace(/^(look up|search|find|what is|who is|tell me about)\s+/i, "")
    .trim();

  return {
    slug,
    label: slug.replaceAll("-", " "),
    search: search || query.replace(/\bfandom\b/gi, "").trim(),
  };
}

function dictionaryWord(query) {
  const match =
    query.match(/\b(?:define|definition of|meaning of|what does)\s+["']?([a-z-]{2,})["']?/i) ||
    query.match(/\b([a-z-]{2,})\s+(?:definition|meaning)\b/i);
  return match?.[1]?.toLowerCase() || "";
}

function githubTarget(query) {
  const lower = query.toLowerCase();
  if (!lower.includes("github") && !/github\.com\//i.test(query)) return null;
  const repo =
    query.match(/github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+)/i)?.[1] ||
    query.match(/\b([a-z0-9_.-]+\/[a-z0-9_.-]+)\b/i)?.[1];
  if (repo) return { repo: repo.replace(/\.git$/i, "") };
  const user =
    query.match(/github\.com\/([a-z0-9_.-]+)/i)?.[1] ||
    query.match(/\bgithub\s+(?:user|profile)\s+([a-z0-9_.-]+)\b/i)?.[1];
  return user ? { user } : null;
}

function packageRequest(query) {
  const lower = query.toLowerCase();
  const npm =
    query.match(/\b(?:npm|node package)\s+(?:package\s+)?(@?[a-z0-9_.~/-]+)\b/i)?.[1] ||
    query.match(/\b([@a-z0-9_.~/-]+)\s+(?:npm package|latest npm version)\b/i)?.[1];
  if (npm && lower.includes("npm")) return { kind: "npm", name: npm };

  const pypi =
    query.match(/\b(?:pypi|python package|pip package)\s+(?:package\s+)?([a-z0-9_.-]+)\b/i)?.[1] ||
    query.match(/\b([a-z0-9_.-]+)\s+(?:pypi|python package|pip package|latest pip version)\b/i)?.[1];
  if (pypi && /\b(pypi|python package|pip package|pip)\b/.test(lower)) return { kind: "pypi", name: pypi };

  return null;
}

function countryName(query) {
  const match =
    query.match(/\b(?:capital|population|currency|languages?)\s+of\s+([a-z][a-z\s-]{2,})(?:\s+country)?\??$/i) ||
    query.match(/\b([a-z][a-z\s-]{2,})\s+(?:country|capital|population|currency|languages?)\??$/i) ||
    query.match(/\b(?:country|capital|population|currency|languages?)\s+(?:of|in|for)?\s*([a-z][a-z\s-]{2,})\??$/i) ||
    query.match(/\b(?:tell me about|what is)\s+([a-z][a-z\s-]{2,})\s+(?:country|like)\??$/i);
  if (!match) return "";
  return match[1].replace(/\b(the|country|capital|population|currency|language|languages|of|in|for)\b/gi, "").trim();
}

function weatherLocation(query) {
  const match =
    query.match(/\b(?:weather|forecast|temperature|temp)\s+(?:in|for|at)?\s*([a-z][a-z\s,.-]{2,})\??$/i) ||
    query.match(/\b(?:what is|what's)\s+the\s+(?:weather|forecast|temperature|temp)\s+(?:in|for|at)\s+([a-z][a-z\s,.-]{2,})\??$/i);
  if (!match) return "";
  return match[1]
    .replace(/\b(today|tomorrow|right now|now|currently)\b/gi, "")
    .replace(/[?.!]+$/g, "")
    .trim();
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

function solveContextMath(message) {
  const lower = message.toLowerCase();
  if (!/\b(last|previous|answer|result|equation)\b/.test(lower)) return null;
  const previous = lastNumericAnswer();
  if (previous === null) return null;

  if (/\bfactorial\b|!/.test(lower)) {
    if (!Number.isInteger(previous) || previous < 0) {
      return `The last answer was ${previous}, and factorial only works cleanly for non-negative whole numbers.`;
    }
    if (previous > 170) {
      return `The last answer was ${previous}. That factorial is too large for this built-in calculator to display safely.`;
    }
    return String(factorial(previous));
  }

  const power = lower.match(/\b(?:power|exponent|to the power of|raised to)\s+(-?\d+(?:\.\d+)?)\b/)?.[1];
  if (power) return String(previous ** Number(power));

  const operations = [
    [/\b(add|plus)\s+(-?\d+(?:\.\d+)?)\b/, (a, b) => a + b],
    [/\b(subtract|minus)\s+(-?\d+(?:\.\d+)?)\b/, (a, b) => a - b],
    [/\b(multiply|times)\s+(-?\d+(?:\.\d+)?)\b/, (a, b) => a * b],
    [/\b(divide|divided by)\s+(-?\d+(?:\.\d+)?)\b/, (a, b) => b === 0 ? null : a / b],
  ];

  for (const [pattern, operation] of operations) {
    const match = lower.match(pattern);
    if (!match) continue;
    const result = operation(previous, Number(match[2]));
    return result === null ? "Cannot divide by zero." : String(result);
  }

  return null;
}

function lastNumericAnswer() {
  for (const item of [...tempMemory].reverse()) {
    const value = String(item.ai || "").trim();
    if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
  }
  return null;
}

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index += 1) {
    result *= index;
  }
  return result;
}

function isCodeRequest(message) {
  const lower = message.toLowerCase();
  return (
    /\b(make|write|create|build|generate|code)\b.*\b(program|script|app|function|java|python|javascript|c\+\+|cpp)\b/i.test(lower) ||
    /\b(java|python|javascript|c\+\+|cpp)\b.*\b(program|script|app|function|code)\b/i.test(lower) ||
    /\b(program|script|app|function|code)\b.*\b(java|python|javascript|c\+\+|cpp)\b/i.test(lower)
  );
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
  label.textContent = `${image.name} (${image.width}x${image.height})${image.hosted?.url ? " uploaded" : ""}`;
  item.append(thumb, label);
  uploadPreview.append(item);
}

function clearUploads() {
  uploadedImages = [];
  imageUpload.value = "";
  uploadPreview.innerHTML = "";
}

closeSources.addEventListener("click", () => sourcesDialog.close());
