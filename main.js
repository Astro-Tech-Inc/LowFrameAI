const messages = document.querySelector("#messages");
const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const statusEl = document.querySelector("#status");
const imageUpload = document.querySelector("#image-upload");
const uploadPreview = document.querySelector("#upload-preview");
const sourcesDialog = document.querySelector("#sources-dialog");
const sourcesList = document.querySelector("#sources-list");
const closeSources = document.querySelector("#close-sources");

const LOWFRAME_MEMORY_KEY = "lowframe_temp_memory_v1";
const LOWFRAME_MEMORY_LIMIT = 12;

let uploadedImages = [];
let tempMemory = loadTempMemory();

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
    rememberTurn(message, response);
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

function greetingAnswer(message) {
  return /^\s*(hi|hello|hey|yo|sup|greetings)\s*[!.?]*\s*$/i.test(message) ? "Hi. What are we working on?" : "";
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
    minecraftServerStatusLookup(message),
    weatherLookup(message),
    dictionaryLookup(message),
    githubLookup(message),
    packageLookup(message),
    countryLookup(message),
    openLibraryLookup(message),
  ]);
  const candidates = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value || [])
    .filter((candidate) => candidate.answer);

  if (!candidates.length) return null;
  candidates.sort((a, b) => scoreCandidate(message, b) - scoreCandidate(message, a));
  const best = candidates[0];
  const answer = best.source?.url?.includes("mcsrvstat.us")
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
      duckDuckGoLookup(query),
      wikipediaLookup(query),
      wikidataLookup(query),
      stackExchangeLookup(query),
      minecraftWikiLookup(query),
      fandomWikiLookup(query),
      openLibraryLookup(query),
      dictionaryLookup(query),
      githubLookup(query),
      packageLookup(query),
      countryLookup(query),
    ]),
  ];
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
    answer: `I could not find enough source-backed info for "${mainQuery}". Try asking with a more specific name or phrase.`,
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
    .replace(/\b(book|novel|open library)\b/gi, "")
    .trim();
  if (search.length < 3) return [];

  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(search)}&limit=5`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Open Library lookup failed");
  const data = await response.json();
  return (data.docs || [])
    .filter((book) => book.title)
    .slice(0, 5)
    .map((book) => {
      const author = book.author_name?.slice(0, 3).join(", ") || "unknown author";
      const year = book.first_publish_year || "unknown year";
      const text = `${book.title} by ${author}, first published ${year}.`;
      return {
        answer: text,
        text: `${text} ${book.subject?.slice(0, 8).join(" ") || ""}`,
        source: {
          title: `Open Library: ${book.title}`,
          url: book.key ? `https://openlibrary.org${book.key}` : url,
          snippet: text,
        },
      };
    });
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
  if (!isProblemRequest(query.toLowerCase()) && !/\b(error|exception|troubleshoot|debug|fix|issue|problem|bios|uefi|f1|f2|setup)\b/i.test(query)) {
    return [];
  }

  const sites = stackExchangeSites(query);
  const searches = await Promise.allSettled(sites.map((site) => stackExchangeSiteSearch(site, query)));
  return searches
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value)
    .slice(0, 8);
}

function stackExchangeSites(query) {
  const lower = query.toLowerCase();
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

async function minecraftWikiLookup(query) {
  if (query.toLowerCase().includes("fandom")) return [];
  if (!query.toLowerCase().includes("minecraft") && !/\brd-\d+\b|\brd\b/i.test(query)) return [];
  return mediaWikiLookup({
    query,
    api: "https://minecraft.wiki/api.php",
    title: "Minecraft Wiki",
    sourceBoost: 2,
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
  const currentVersionIntent = lower.includes("minecraft") &&
    /\b(last|latest|current|newest)\b/.test(lower) &&
    !/\brd\b|pre-classic|historical|oldest/.test(lower);
  let score = 0;
  if (url.includes("wikipedia.org")) score += 1;
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
  return score;
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
  const queries = [
    clean,
    clean
      .replace(/\b(go|look|check)\s+(on|at)\s+.+?\s+for\s+help\.?/i, "")
      .replace(/\bofficial\b/gi, "")
      .trim(),
  ];

  if (memoryTopic && looksLikeFollowUp(clean)) {
    queries.push(`${memoryTopic} ${clean}`);
    queries.push(`${memoryTopic} ${clean} troubleshooting`);
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

  return uniqueStrings(queries.filter(Boolean)).slice(0, 12);
}

function cleanLookupQuery(message) {
  return message
    .replace(/^(look up|search for|search|what is|what are|who is|who are|tell me about)\s+/i, "")
    .trim() || message.trim();
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

  const product = productTerms(query);
  if (product.length && isProblemRequest(lower)) {
    queries.push(`${product.join(" ")} support troubleshooting`);
  }

  return queries;
}

function isProblemRequest(lower) {
  return /\b(won't|wont|will not|can't|cant|cannot|doesn't|doesnt|not working|broken|error|issue|problem|trouble|fix|help|stuck|crash|crashing|offline|failed|failure|no display|no signal|not booting|turn on|boot|bios reset|setup screen)\b/.test(lower);
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

function looksLikeFollowUp(text) {
  const lower = text.toLowerCase();
  return text.length < 160 && (
    /^(it|that|this|now|still|also|actually|no|yes|ok|okay)\b/.test(lower) ||
    /\b(f1|f2|continue|setup|error|screen|message|same|different|instead|now)\b/.test(lower)
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

  if (isProblemRequest(lower) && candidates.some(isStackExchangeCandidate)) {
    return composeProblemAnswer(query, candidates);
  }

  if (/^(what is|what are|who is|who are|tell me about)\b/i.test(query) || facts.length) {
    const first = facts[0] || cleanFact(best.answer);
    const second = facts.find((fact) => fact !== first && !tooSimilar(fact, first));
    let firstPlain = plainFact(first);
    if (subject && normalizeTitle(firstPlain).startsWith(`${normalizeTitle(subject)} `)) {
      firstPlain = firstPlain.replace(new RegExp(`^${escapeRegExp(subject)}\\s+(is|are|means)\\s+`, "i"), "");
      firstPlain = `${subject} is ${firstPlain}`;
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

  return `I checked ${sourceCount || stackCandidates.length} troubleshooting sources. The common pattern is ${joinNatural(uniqueThemes)}. ${exactNote} Start with the simplest split-test: remove extras, confirm power connections, try one RAM stick, check whether the machine reaches BIOS, and then narrow from display/GPU versus boot-drive detection based on what appears on screen.`;
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

  if (problemSource && problemOverlap(query, text) >= 2) {
    return "";
  }

  if ((score < 5 && !exactTitleMatch(query, best)) || (hasSpecificToken && missing.length)) {
    const terms = missing.length ? missing.join(", ") : required.join(", ");
    return `I found nearby-looking results, but they did not actually match ${terms}. Try giving me one more clue, like whether it is a player, mod, server, product, or wiki page.`;
  }

  if (required.length >= 2 && missing.length >= Math.ceil(required.length / 2)) {
    return `I found sources around the topic, but not enough of the important words matched. I do not want to pretend the wrong page is the answer.`;
  }

  return "";
}

function problemOverlap(query, text) {
  const problemWords = ["pc", "computer", "desktop", "boot", "turn", "power", "display", "screen", "bios", "setup", "reset", "error", "problem", "issue"];
  return problemWords.filter((word) => query.toLowerCase().includes(word) && text.includes(word)).length;
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
  ]);
  return keywords(lower)
    .filter((word) => !soft.has(word))
    .filter((word) => word.length >= 4 || /\d/.test(word));
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
