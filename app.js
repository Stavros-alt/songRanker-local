// drSongRanker, stripped down, with the song pool coming
// from a user picked folder instead of the built in soundtracks.

document.addEventListener("DOMContentLoaded", () => {
	// encodeURI doesn't touch ? so it breaks filenames with question marks.
	function encodeFilePath(path) {
		return encodeURI(path).replace(/\?/g, "%3F");
	}

	// DOM cache
	const mainTitle = document.getElementById("main-title");
	const dropZone = document.getElementById("drop-zone");
	const browseBtn = document.getElementById("browse-btn");
	const folderInput = document.getElementById("folder-input");
	const changeFolderBtn = document.getElementById("change-folder-btn");

	const arena = document.querySelector(".arena");
	const songACard = document.getElementById("songA-card");
	const songBCard = document.getElementById("songB-card");
	const songAName = document.getElementById("songA-name");
	const songBName = document.getElementById("songB-name");
	const songARank = document.getElementById("songA-rank");
	const songBRank = document.getElementById("songB-rank");
	const chooseABtn = document.getElementById("chooseA-btn");
	const chooseBBtn = document.getElementById("chooseB-btn");
	const chooseAMobileBtn = document.getElementById("chooseA-mobile-btn");
	const chooseBMobileBtn = document.getElementById("chooseB-mobile-btn");
	const skipBtn = document.getElementById("skip-btn");
	const undoBtn = document.getElementById("undo-btn");
	const resetBtn = document.getElementById("reset-btn");
	const progressBar = document.getElementById("progress-bar");
	const progressText = document.getElementById("progress-text");
	const rankingContainer = document.querySelector(".ranking-container");
	const toggleRankingsBtn = document.getElementById("toggle-rankings-btn");
	const audioA = document.getElementById("audioA");
	const audioB = document.getElementById("audioB");
	const previewBtns = document.querySelectorAll(".preview-btn");
	const fullPlayBtns = document.querySelectorAll(".full-play-btn");
	const musicPlayerBar = document.getElementById("music-player-bar");
	const playerSongName = document.getElementById("player-song-name");
	const playerPrevBtn = document.getElementById("player-prev-btn");
	const playerPlayBtn = document.getElementById("player-play-btn");
	const playerNextBtn = document.getElementById("player-next-btn");
	const playerCloseBtn = document.getElementById("player-close-btn");
	const playlistAudio = document.getElementById("playlist-audio");
	const playListBtn = document.getElementById("play-list-btn");
	const weightedShuffleBtn = document.getElementById("weighted-shuffle-btn");
	const rankingList = document.getElementById("ranking-list");
	const settingsBtn = document.getElementById("settings-btn");
	const settingsModal = document.getElementById("settings-modal");
	const closeSettingsBtn = document.getElementById("close-settings-btn");
	const volumeSlider = document.getElementById("volume-slider");
	const playerProgress = document.getElementById("player-progress");
	const playerCurrentTime = document.getElementById("player-current-time");
	const playerDuration = document.getElementById("player-duration");
	const personalVoteStat = document.getElementById("personal-vote-stat");

	// global variables

	let currentSongA = null;
	let currentSongB = null;
	let activePreviewTimeout = null;
	let currentActiveAudio = null; // which audio element is playing, so the others get stopped.

	// status line in the drop zone.
	const dropStatus = document.getElementById("drop-status");

	function setDropStatus(msg) {
		if (dropStatus) dropStatus.textContent = msg;
	}

	// what this browser can do.
	const caps = {
		picker: typeof window.showDirectoryPicker === "function",
		idb: (() => {
			try {
				const r = indexedDB.open("songRankerCapsCheck", 1);
				r.onupgradeneeded = () => r.result.close();
				r.onerror = () => {};
				return true;
			} catch (e) {
				return false;
			}
		})(),
		dropHandle:
			typeof DataTransferItem !== "undefined" &&
			"getAsFileSystemHandle" in DataTransferItem.prototype,
	};

	function isChromium() {
		return /Chrome|CriOS|Edg|OPR/.test(navigator.userAgent);
	}

	const APP_VERSION = "1.1.1";
	const PREVIEW_DURATION = 10000;
	const PREVIEW_START_TIME = 30;

	const STATE_KEY = "localSongRanker";
	const VERSION_KEY = "localSongRankerVersion";
	const AUDIO_EXTENSIONS = new Set([
		"mp3",
		"ogg",
		"wav",
		"flac",
		"m4a",
		"aac",
		"opus",
		"webm",
		"wma",
		"aiff",
	]);

	// persistence
	// ratings live in localStorage keyed by song path. dropping the same
	// folder again restores everything.
	const state = loadState();

	// version check. i show a toast if stored version differs and bump it.
	// ratings stay untouched only version key changes
	(function handleVersion() {
		try {
			const stored = localStorage.getItem(VERSION_KEY);
			const verEl = document.getElementById("app-version");
			if (verEl) verEl.textContent = "v" + APP_VERSION;
			if (stored && stored !== APP_VERSION) {
				const toast = document.getElementById("update-toast");
				if (toast) {
					toast.classList.remove("hidden");
					setTimeout(() => toast.classList.add("hidden"), 3000);
				}
			}
			if (stored !== APP_VERSION) localStorage.setItem(VERSION_KEY, APP_VERSION);
		} catch (e) {}
	})();

	function loadState() {
		try {
			const raw = localStorage.getItem(STATE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				return {
					comparisons: parsed.comparisons || 0,
					history: parsed.history || null,
					recentMatches: parsed.recentMatches || [],
					preventDuplicates:
						parsed.preventDuplicates === undefined ? true : parsed.preventDuplicates,
					volume: parseFloat(parsed.volume === undefined ? "0.5" : parsed.volume),
					songRatings: parsed.songRatings || {},
				};
			}
		} catch (e) {
			console.error("state load failed:", e.message);
		}
		return {
			comparisons: 0,
			history: null,
			recentMatches: [],
			preventDuplicates: true,
			volume: 0.5,
			songRatings: {},
		};
	}

	function saveState() {
		try {
			// ratings persist keyed by path. File objects don't serialize,
			// so rebuild a plain map from the live pool.
			const songRatings = {};
			for (const s of state.songs) {
				songRatings[s.path] = {
					rating: s.rating,
					comparisons: s.comparisons,
					matchHistory: s.matchHistory,
				};
			}
			localStorage.setItem(
				STATE_KEY,
				JSON.stringify({
					comparisons: state.comparisons,
					history: state.history,
					recentMatches: state.recentMatches,
					preventDuplicates: state.preventDuplicates,
					volume: state.volume,
					songRatings,
				}),
			);
		} catch (e) {
			console.error("state save failed:", e.message);
		}
	}

	function getRating(song) {
		return song.rating;
	}

	function getComparisons(song) {
		return song.comparisons;
	}

	function getMatchHistory(song) {
		return song.matchHistory || [];
	}

	// the pool is whatever the user dropped.
	function getActiveSongs() {
		return state.songs.filter((s) => !s.hidden);
	}

	// folder picking
	const urlCache = new Map();

	function clearObjectUrls() {
		urlCache.forEach((url) => URL.revokeObjectURL(url));
		urlCache.clear();
	}

	function getObjectUrl(file) {
		if (!urlCache.has(file.name + file.size)) {
			urlCache.set(file.name + file.size, URL.createObjectURL(file));
		}
		return urlCache.get(file.name + file.size);
	}

	function isAudioFile(file) {
		const dot = file.name.lastIndexOf(".");
		if (dot === -1) return false;
		const ext = file.name.slice(dot + 1).toLowerCase();
		return AUDIO_EXTENSIONS.has(ext);
	}

	// input.webkitdirectory gives files with webkitRelativePath like
	// "Folder/sub/01 intro.mp3". strip the leading folder so names read
	// naturally but subfolders still disambiguate.
	function relativeName(file) {
		const path = file.webkitRelativePath || "";
		const rel = path.split("/").slice(1).join("/");
		const base = rel || file.name;
		const dot = base.lastIndexOf(".");
		return dot === -1 ? base : base.slice(0, dot);
	}

	// entries is [{ path, file }]. path is the display name and the
	// persistence key, so every picking method must produce the same path.
	function acceptSongs(entries) {
		clearObjectUrls();
		stopAllMusic();
		const seen = new Set();
		const pool = [];
		for (const { path, file } of entries) {
			if (seen.has(path)) continue;
			seen.add(path);
			// restore saved ratings by path if they exist
			const saved = state.songRatings[path] || {};
			pool.push({
				id: pool.length + 1,
				path,
				name: path,
				file,
				rating: saved.rating || 1500,
				comparisons: saved.comparisons || 0,
				matchHistory: saved.matchHistory || [],
			});
		}
		pool.sort((a, b) => a.name.localeCompare(b.name));

		if (pool.length === 0) {
			alert("no audio files found in that folder.");
			return;
		}

		state.songs = pool;
		state.history = null;
		state.recentMatches = [];

		const restored = pool.filter((s) => state.songRatings[s.path]).length;
		dropZone.classList.add("hidden");
		browseBtn.classList.remove("hidden");
		const dropTitle = document.getElementById("drop-title");
		if (dropTitle) dropTitle.textContent = "DROP YOUR SONGS FOLDER";
		const hint = document.getElementById("reconnect-hint");
		if (hint) hint.classList.add("hidden");
		reconnectBtn.classList.add("hidden");
		if (copyModeBtn) copyModeBtn.classList.add("hidden");

		updateApp();
		saveState();

		// flash the restored count, briefly
		if (restored) {
			personalVoteStat.textContent += ` · ${restored} restored`;
			clearTimeout(personalVoteStat._timer);
			personalVoteStat._timer = setTimeout(() => {
				personalVoteStat.textContent = `YOUR VOTES: ${state.comparisons}`;
			}, 4000);
		}
	}

	// remembering the folder
	// the directory handle gets stashed in indexeddb. the browser never
	// persists the permission itself, so a reload either gets it back
	// silently or needs one reconnect click.

	function openHandleDB() {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open("songRankerHandles", 1);
			req.onupgradeneeded = () => req.result.createObjectStore("handles");
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	async function saveDirHandle(handle) {
		try {
			const db = await openHandleDB();
			await new Promise((resolve, reject) => {
				const tx = db.transaction("handles", "readwrite");
				tx.objectStore("handles").put(handle, "folder");
				tx.oncomplete = resolve;
				tx.onerror = () => reject(tx.error);
			});
			db.close();
		} catch (e) {
			console.error("handle save failed:", e.message);
			setDropStatus(`can't remember the folder: ${e.message}`);
			// warn loudly once so the failure isn't silent
			if (!window.__warnedHandleSave) {
				window.__warnedHandleSave = true;
				alert(
					`couldn't save folder access: ${e.message}. it'll ask you to pick the folder each time.`,
				);
			}
		}
	}

	async function loadDirHandle() {
		try {
			const db = await openHandleDB();
			const handle = await new Promise((resolve, reject) => {
				const tx = db.transaction("handles", "readonly");
				const req = tx.objectStore("handles").get("folder");
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
			db.close();
			return handle || null;
		} catch {
			return null;
		}
	}

	// walk a real directory handle (from the picker or a folder drop).
	async function walkDirHandle(dirHandle, basePath, out) {
		for await (const [name, handle] of dirHandle.entries()) {
			const dot = name.lastIndexOf(".");
			const base = dot === -1 ? name : name.slice(0, dot);
			const rel = basePath ? `${basePath}/${base}` : base;
			if (handle.kind === "file") {
				const file = await handle.getFile();
				if (isAudioFile(file)) out.push({ path: rel, file });
			} else if (handle.kind === "directory") {
				await walkDirHandle(handle, rel, out);
			}
		}
	}

	async function pickFolder() {
		if (window.showDirectoryPicker) {
			try {
				const handle = await window.showDirectoryPicker();
				await saveDirHandle(handle);
				const files = [];
				await walkDirHandle(handle, "", files);
				if (files.length) acceptSongs(files);
				else alert("no audio files found in that folder.");
				return;
			} catch (e) {
				// AbortError = user closed the picker.
				if (e.name !== "AbortError") console.error("picker failed:", e.message);
				return;
			}
		}
		folderInput.click();
	}

	browseBtn.addEventListener("click", pickFolder);
	changeFolderBtn.addEventListener("click", pickFolder);

	folderInput.addEventListener("change", () => {
		if (folderInput.files.length) {
			storeAndLoad(
				Array.from(folderInput.files).map((f) => ({
					path: relativeName(f),
					file: f,
				})),
			);
		}
	});

	// promise around the entry reader. readEntries comes back in batches.
	function readDir(entry) {
		return new Promise((resolve) => {
			const reader = entry.createReader();
			const out = [];
			const readBatch = () => {
				reader.readEntries(
					(batch) => {
						if (batch.length === 0) {
							resolve(out);
							return;
						}
						batch.forEach((e) => out.push(e));
						readBatch();
					},
					() => resolve(out),
				);
			};
			readBatch();
		});
	}

	function traverseEntry(entry, out) {
		return new Promise((resolve) => {
			if (entry.isFile) {
				entry.file(
					(file) => {
						// fullPath is like /Root/sub/track.mp3. strip the root
						// folder so drop paths match the picker paths.
						const parts = entry.fullPath.split("/").filter(Boolean);
						const path =
							parts.slice(1).join("/") || file.name.replace(/\.[^.]+$/, "");
						out.push({ path, file });
						resolve();
					},
					() => resolve(),
				);
			} else if (entry.isDirectory) {
				readDir(entry).then((entries) => {
					Promise.all(entries.map((e) => traverseEntry(e, out))).then(resolve);
				});
			} else {
				resolve();
			}
		});
	}

	// dropping anywhere works. a dropped folder becomes a real handle via
	// getAsFileSystemHandle and gets remembered like a picked one. legacy
	// entry reader and the flat file list are the fallbacks.
	window.addEventListener("dragover", (e) => {
		e.preventDefault();
		dropZone.classList.add("dragging");
	});
	window.addEventListener("dragleave", () => {
		dropZone.classList.remove("dragging");
	});
	window.addEventListener("drop", async (e) => {
		e.preventDefault();
		dropZone.classList.remove("dragging");
		const items = e.dataTransfer.items;
		if (items && items.length) {
			// modern api first.
			let dirHandle = null;
			for (const item of items) {
				if (item.getAsFileSystemHandle) {
					try {
						const h = await item.getAsFileSystemHandle();
						if (h && h.kind === "directory") {
							dirHandle = h;
							break;
						}
					} catch {
						// fall through
					}
				}
			}
			if (dirHandle) {
				await saveDirHandle(dirHandle);
				const files = [];
				await walkDirHandle(dirHandle, "", files);
				if (files.length) acceptSongs(files);
				return;
			}

			// legacy entry reader.
			const entries = [];
			for (const item of items) {
				const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
				if (entry) entries.push(entry);
			}
			if (entries.length) {
				const files = [];
				await Promise.all(entries.map((entry) => traverseEntry(entry, files)));
				await storeAndLoad(files);
				return;
			}
		}
		await storeAndLoad(
			Array.from(e.dataTransfer.files).map((f) => ({
				path: f.name.replace(/\.[^.]+$/, ""),
				file: f,
			})),
		);
	});

	// copy mode fallback
	// browsers without the file system access api (firefox, safari) can't
	// reopen a folder. for them the songs get copied into the browser's own
	// storage instead. opt in only, costs disk space.

	let opfsAvailable = false;
	let opfsRoot = null;

	async function initOpfs() {
		try {
			opfsRoot = await navigator.storage.getDirectory();
			opfsAvailable = true;
		} catch (e) {
			console.error("opfs unavailable:", e.message);
		}
	}

	async function opfsSongsDir() {
		return opfsRoot.getDirectoryHandle("songs", { create: true });
	}

	async function clearOpfsSongs() {
		if (!opfsAvailable) return;
		try {
			const dir = await opfsSongsDir();
			for await (const [name] of dir.entries()) {
				await dir.removeEntry(name, { recursive: true });
			}
		} catch (e) {
			console.error("opfs clear failed:", e.message);
		}
	}

	// write one file into opfs/songs/<display path>.<ext>
	async function writeOpfsFile(dir, path, file) {
		const dot = file.name.lastIndexOf(".");
		const ext = dot === -1 ? "" : file.name.slice(dot);
		const parts = (path + ext).split("/");
		let current = dir;
		for (let i = 0; i < parts.length - 1; i++) {
			current = await current.getDirectoryHandle(parts[i], { create: true });
		}
		const fh = await current.getFileHandle(parts[parts.length - 1], {
			create: true,
		});
		const w = await fh.createWritable();
		await w.write(file);
		await w.close();
	}

	async function importToOpfs(entries) {
		if (!opfsAvailable) return 0;
		const dir = await opfsSongsDir();
		let count = 0;
		for (const { path, file } of entries) {
			try {
				await writeOpfsFile(dir, path, file);
				count++;
			} catch (e) {
				console.error(`opfs import failed for ${path}:`, e.message);
			}
		}
		return count;
	}

	async function walkOpfsDir(dir, basePath, out) {
		for await (const [name, handle] of dir.entries()) {
			const dot = name.lastIndexOf(".");
			const base = dot === -1 ? name : name.slice(0, dot);
			const rel = basePath ? `${basePath}/${base}` : base;
			if (handle.kind === "file") {
				const file = await handle.getFile();
				if (isAudioFile(file)) out.push({ path: rel, file });
			} else if (handle.kind === "directory") {
				await walkOpfsDir(handle, rel, out);
			}
		}
	}

	async function loadFromOpfs() {
		if (!opfsAvailable) return [];
		try {
			const dir = await opfsSongsDir();
			const out = [];
			await walkOpfsDir(dir, "", out);
			return out;
		} catch (e) {
			console.error("opfs load failed:", e.message);
			return [];
		}
	}

	const COPY_MODE_KEY = "localSongRankerCopyMode";

	function isCopyMode() {
		return localStorage.getItem(COPY_MODE_KEY) === "1";
	}

	// route a picked set of files to the right storage. browsers that can't
	// remember folders always get the copy.
	async function storeAndLoad(entries) {
		if (entries.length === 0) {
			alert("no audio files found in that folder.");
			return;
		}
		if (!caps.picker || isCopyMode()) {
			if (opfsAvailable) {
				setDropStatus(`importing ${entries.length} songs...`);
				await clearOpfsSongs();
				await importToOpfs(entries);
				localStorage.setItem(COPY_MODE_KEY, "1");
				const stored = await loadFromOpfs();
				if (stored.length) {
					acceptSongs(stored);
					return;
				}
			}
		}
		acceptSongs(entries);
	}

	const copyModeBtn = document.getElementById("copy-mode-btn");
	const directModeBtn = document.getElementById("direct-mode-btn");
	const copiesModeBtn = document.getElementById("copies-mode-btn");

	function showCopyOffer() {
		if (!copyModeBtn) return;
		browseBtn.classList.add("hidden");
		copyModeBtn.classList.remove("hidden");
	}

	if (copyModeBtn) {
		copyModeBtn.addEventListener("click", () => folderInput.click());
	}

	// two selectable storage modes on the start screen, each with its
	// tradeoff. the active one gets highlighted, the other switches mode
	// for the next folder pick.
	function updateStorageModeBtn() {
		if (!caps.picker) {
			directModeBtn?.classList.add("hidden");
			copiesModeBtn?.classList.add("hidden");
			return;
		}
		directModeBtn?.classList.remove("hidden");
		copiesModeBtn?.classList.remove("hidden");
		const copy = isCopyMode();
		directModeBtn?.classList.toggle("active", !copy);
		copiesModeBtn?.classList.toggle("active", copy);
	}

	if (copiesModeBtn) {
		copiesModeBtn.addEventListener("click", async () => {
			if (isCopyMode()) return;
			if (
				!confirm(
					"store copies of your songs in the browser instead? uses disk space, but no folder permissions needed from then on.",
				)
			)
				return;
			localStorage.setItem(COPY_MODE_KEY, "1");
			setDropStatus("next folder gets stored as copies, uses disk space.");
			updateStorageModeBtn();
		});
	}

	if (directModeBtn) {
		directModeBtn.addEventListener("click", async () => {
			if (!isCopyMode()) return;
			if (
				!confirm(
					"switch back to direct folder access? the stored copies get deleted.",
				)
			)
				return;
			await clearOpfsSongs();
			localStorage.removeItem(COPY_MODE_KEY);
			setDropStatus("next folder uses direct access, no disk space.");
			updateStorageModeBtn();
		});
	}

	// elo
	function updateElo(
		winnerRating,
		loserRating,
		winnerComparisons,
		loserComparisons,
	) {
		const getK = (comparisons) => (comparisons < 10 ? 100 : 32);

		const kWinner = getK(winnerComparisons);
		const kLoser = getK(loserComparisons);

		const expectedWin = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));

		const winnerChange = kWinner * (1 - expectedWin);
		const loserChange = kLoser * (expectedWin - 1);

		return {
			newWinnerRating: winnerRating + winnerChange,
			newLoserRating: loserRating + loserChange,
		};
	}

	function presentNewPair() {
		const availableSongs = getActiveSongs();

		if (!availableSongs || availableSongs.length < 2) {
			songAName.textContent = "NOT ENOUGH SONGS";
			songBName.textContent = "IN THIS LIST";
			if (songARank) songARank.textContent = "";
			if (songBRank) songBRank.textContent = "";

			chooseABtn.disabled = true;
			chooseBBtn.disabled = true;
			if (chooseAMobileBtn) chooseAMobileBtn.disabled = true;
			if (chooseBMobileBtn) chooseBMobileBtn.disabled = true;
			skipBtn.disabled = true;
			return;
		}

		chooseABtn.disabled = false;
		chooseBBtn.disabled = false;
		if (chooseAMobileBtn) chooseAMobileBtn.disabled = false;
		if (chooseBMobileBtn) chooseBMobileBtn.disabled = false;
		skipBtn.disabled = false;

		let song1, song2;
		let attempts = 0;
		const maxAttempts = 50;

		do {
			const roll = Math.random();

			if (roll < 0.6) {
				// 60% for underrated
				const sortedByVotes = [...availableSongs].sort(
					(a, b) => getComparisons(a) - getComparisons(b),
				);
				const uncertaintyPoolSize = Math.max(
					5,
					Math.floor(availableSongs.length * 0.25),
				);
				const uncertaintyPool = sortedByVotes.slice(0, uncertaintyPoolSize);
				song1 = uncertaintyPool[Math.floor(Math.random() * uncertaintyPool.length)];
			} else if (roll < 0.9) {
				// 30% for top rated
				const sortedByRating = [...availableSongs].sort(
					(a, b) => getRating(b) - getRating(a),
				);
				const topPoolSize = Math.min(20, availableSongs.length);
				const topPool = sortedByRating.slice(0, topPoolSize);
				song1 = topPool[Math.floor(Math.random() * topPool.length)];
			} else {
				// 10% pure chaos
				song1 = availableSongs[Math.floor(Math.random() * availableSongs.length)];
			}

			const sortedOpponents = [...availableSongs]
				.filter((s) => s.id !== song1.id)
				.sort(
					(a, b) =>
						Math.abs(getRating(a) - getRating(song1)) -
						Math.abs(getRating(b) - getRating(song1)),
				);

			const neighborPoolSize = 10;
			const neighborPool = sortedOpponents.slice(0, neighborPoolSize);
			song2 = neighborPool[Math.floor(Math.random() * neighborPool.length)];

			if (!state.preventDuplicates || availableSongs.length < 5) break;

			const pairKey = [song1.id, song2.id].sort((a, b) => a - b).join("-");

			// check match history to avoid repeats
			const history = getMatchHistory(song1);
			let alreadyFoughtInfo = false;
			for (let i = 0; i < history.length; i++) {
				if (history[i].opponentId === song2.id) {
					alreadyFoughtInfo = true;
					break;
				}
			}

			if (!state.recentMatches.includes(pairKey) && !alreadyFoughtInfo) break;
			attempts++;
		} while (attempts < maxAttempts);

		if (state.preventDuplicates && song1 && song2) {
			const pairKey = [song1.id, song2.id].sort((a, b) => a - b).join("-");
			state.recentMatches.push(pairKey);
			if (state.recentMatches.length > 20) state.recentMatches.shift();
		}

		currentSongA = song1;
		currentSongB = song2;

		if (songAName && currentSongA) songAName.textContent = currentSongA.name;
		if (songBName && currentSongB) songBName.textContent = currentSongB.name;

		if (songARank && songBRank && currentSongA && currentSongB) {
			const sortedByRating = [...availableSongs].sort(
				(a, b) => getRating(b) - getRating(a),
			);
			const rankA = sortedByRating.findIndex((s) => s.id === currentSongA.id) + 1;
			const rankB = sortedByRating.findIndex((s) => s.id === currentSongB.id) + 1;

			songARank.textContent = `#${rankA}`;
			songBRank.textContent = `#${rankB}`;
		}

		if (chooseABtn && currentSongA)
			chooseABtn.textContent = `I prefer ${currentSongA.name}`;
		if (chooseBBtn && currentSongB)
			chooseBBtn.textContent = `I prefer ${currentSongB.name}`;
		if (chooseAMobileBtn && currentSongA)
			chooseAMobileBtn.textContent = `I prefer ${currentSongA.name}`;
		if (chooseBMobileBtn && currentSongB)
			chooseBMobileBtn.textContent = `I prefer ${currentSongB.name}`;

		audioA.src = getObjectUrl(currentSongA.file);
		audioB.src = getObjectUrl(currentSongB.file);
		// no eager load(). buffers on first play instead.

		arena.classList.remove("slide-in");
		setTimeout(() => {
			songACard.classList.remove("selected", "loser");
			songBCard.classList.remove("selected", "loser");
			arena.classList.add("slide-in");
		}, 50);

		if (undoBtn) undoBtn.disabled = !state.history;
	}

	function handleChoice(winner) {
		if (!currentSongA || !currentSongB) {
			return;
		}

		// lock buttons until vote processes
		chooseABtn.disabled = true;
		chooseBBtn.disabled = true;
		if (chooseAMobileBtn) chooseAMobileBtn.disabled = true;
		if (chooseBMobileBtn) chooseBMobileBtn.disabled = true;
		skipBtn.disabled = true;

		// save history before we mess it up.
		state.history = {
			songA: {
				id: currentSongA.id,
				rating: getRating(currentSongA),
				comparisons: getComparisons(currentSongA),
			},
			songB: {
				id: currentSongB.id,
				rating: getRating(currentSongB),
				comparisons: getComparisons(currentSongB),
			},
			totalComparisons: state.comparisons,
		};

		if (winner) {
			const winnerSong = winner === "A" ? currentSongA : currentSongB;
			const loserSong = winner === "A" ? currentSongB : currentSongA;

			const { newWinnerRating, newLoserRating } = updateElo(
				getRating(winnerSong),
				getRating(loserSong),
				getComparisons(winnerSong),
				getComparisons(loserSong),
			);

			const winnerChange = newWinnerRating - getRating(winnerSong);
			const loserChange = newLoserRating - getRating(loserSong);

			recordMatchHistory(winnerSong, loserSong, false, winnerChange, loserChange);

			winnerSong.rating = newWinnerRating;
			loserSong.rating = newLoserRating;
			winnerSong.comparisons++;
			loserSong.comparisons++;
		} else {
			recordMatchHistory(null, null, true);
		}

		state.comparisons++;

		chooseABtn.disabled = false;
		chooseBBtn.disabled = false;
		if (chooseAMobileBtn) chooseAMobileBtn.disabled = false;
		if (chooseBMobileBtn) chooseBMobileBtn.disabled = false;
		skipBtn.disabled = false;
		updateApp();
		saveState();
	}

	function recordMatchHistory(
		winner,
		_loser,
		isTie = false,
		winnerChange = 0,
		loserChange = 0,
	) {
		const timestamp = Date.now();
		const resultA = isTie ? "tie" : winner === currentSongA ? "win" : "loss";
		const resultB = isTie ? "tie" : winner === currentSongB ? "win" : "loss";
		const changeA = isTie
			? 0
			: winner === currentSongA
				? winnerChange
				: loserChange;
		const changeB = isTie
			? 0
			: winner === currentSongB
				? winnerChange
				: loserChange;

		const historyListA = getMatchHistory(currentSongA);
		const historyListB = getMatchHistory(currentSongB);

		historyListA.unshift({
			opponent: currentSongB.name,
			opponentId: currentSongB.id,
			result: resultA,
			ratingChange: changeA,
			time: timestamp,
		});

		historyListB.unshift({
			opponent: currentSongA.name,
			opponentId: currentSongA.id,
			result: resultB,
			ratingChange: changeB,
			time: timestamp,
		});

		// cap history to 100 entries
		if (historyListA.length > 100) historyListA.pop();
		if (historyListB.length > 100) historyListB.pop();

		currentSongA.matchHistory = historyListA;
		currentSongB.matchHistory = historyListB;
	}

	function stopAllMusic() {
		if (activePreviewTimeout) {
			clearTimeout(activePreviewTimeout);
			activePreviewTimeout = null;
		}
		audioA.pause();
		audioB.pause();
		playlistAudio.pause();
		isPlaylistPlaying = false;
		playerPlayBtn.textContent = "⏯";
		if (playerProgress) playerProgress.value = 0;
		if (playerCurrentTime) playerCurrentTime.textContent = "0:00";
		if (playerDuration) playerDuration.textContent = "0:00";
	}

	function playPreview(songKey) {
		stopAllMusic();

		const audioEl = songKey === "A" ? audioA : audioB;
		const otherAudioEl = songKey === "A" ? audioB : audioA;
		const songData = songKey === "A" ? currentSongA : currentSongB;

		otherAudioEl.pause();

		currentActiveAudio = audioEl;

		playerSongName.textContent = `${songData.name} (Preview)`;

		// no buttons for previews.
		playerPrevBtn.style.visibility = "hidden";
		playerNextBtn.style.visibility = "hidden";

		musicPlayerBar.classList.remove("hidden");

		// can't seek until metadata loads, silently breaks on the first song otherwise.
		const onMetaReady = () => {
			audioEl.removeEventListener("loadedmetadata", onMetaReady);

			// if it's short, play the last 10 seconds.
			// if it's 30 to 60s, play from the start.
			// otherwise skip the first 30s, the middle matters most for a preview.
			// folder songs have no precomputed duration so use the actual one.
			const duration = songData.duration || audioEl.duration || 0;
			let startTime = PREVIEW_START_TIME;
			if (duration < 30) {
				startTime = Math.max(0, duration - 10);
			} else if (duration <= 60) {
				startTime = 0;
			}

			audioEl.currentTime = startTime;
			const playPromise = audioEl.play();
			if (playPromise !== undefined) {
				playPromise
					.then(() => {
						playerPlayBtn.textContent = "⏸";
						activePreviewTimeout = setTimeout(() => {
							audioEl.pause();
							playerPlayBtn.textContent = "⏯";
						}, PREVIEW_DURATION);
					})
					.catch((err) => {
						console.error("Audio preview playback failed:", err.message);
					});
			}
		};

		audioEl.addEventListener("loadedmetadata", onMetaReady);
		audioEl.onerror = () =>
			console.error("preview audio load error for:", songData.name);
		audioEl.src = getObjectUrl(songData.file);
		audioEl.load();
	}

	function playFullSong(songKey) {
		const songData = songKey === "A" ? currentSongA : currentSongB;
		if (!songData) {
			console.warn("playFullSong called with no song data.");
			return;
		}
		stopAllMusic();

		const audioEl = songKey === "A" ? audioA : audioB;

		currentActiveAudio = audioEl;

		playerSongName.textContent = songData.name;

		playerPrevBtn.style.visibility = "hidden";
		playerNextBtn.style.visibility = "hidden";

		musicPlayerBar.classList.remove("hidden");

		// load() resets to t=0 anyway, no need to seek.
		audioEl.onerror = () =>
			console.error("full song audio load error for:", songData.name);
		audioEl.src = getObjectUrl(songData.file);
		audioEl.load();
		audioEl
			.play()
			.then(() => {
				playerPlayBtn.textContent = "⏸";
			})
			.catch((err) => {
				console.error("Full playback failed:", err.message);
			});
	}

	function displayRankings() {
		rankingList.innerHTML = "";

		const sortedSongs = [...getActiveSongs()].sort(
			(a, b) => getRating(b) - getRating(a),
		);

		sortedSongs.forEach((song, index) => {
			const li = document.createElement("li");
			li.style.cursor = "pointer";
			li.addEventListener("click", () => playSongFromCurrentList(index));

			const nameSpan = document.createElement("span");
			nameSpan.classList.add("song-name");
			nameSpan.textContent = song.name;
			li.appendChild(nameSpan);

			const details = document.createElement("small");
			details.textContent = Math.round(getRating(song));
			li.appendChild(details);

			rankingList.appendChild(li);
		});
	}

	function updateProgress() {
		const activeSongs = getActiveSongs();
		const poolSize = activeSongs.length || 1;
		const accuracy = 100 * (1 - Math.exp(-state.comparisons / poolSize));

		if (progressBar) progressBar.style.width = `${accuracy}%`;

		if (progressText) {
			progressText.textContent = `Ranking Accuracy: ${accuracy.toFixed(1)}%`;
		}

		if (personalVoteStat) {
			personalVoteStat.textContent = `YOUR VOTES: ${state.comparisons}`;
		}
	}

	function resetState() {
		if (
			confirm("THIS WILL ERASE ALL YOUR VOTES AND RANKINGS FOREVER. ARE YOU SURE?")
		) {
			localStorage.removeItem(STATE_KEY);
			location.reload();
		}
	}

	function undoVote() {
		if (!state.history) return;

		const songA = state.songs.find((s) => s.id === state.history.songA.id);
		const songB = state.songs.find((s) => s.id === state.history.songB.id);

		if (songA && songB) {
			songA.rating = state.history.songA.rating;
			songA.comparisons = state.history.songA.comparisons;
			songB.rating = state.history.songB.rating;
			songB.comparisons = state.history.songB.comparisons;
			state.comparisons = state.history.totalComparisons;

			currentSongA = songA;
			currentSongB = songB;

			const historyListA = songA.matchHistory || [];
			const historyListB = songB.matchHistory || [];
			if (historyListA.length > 0) historyListA.shift();
			if (historyListB.length > 0) historyListB.shift();
		}

		state.history = null;

		// update rankings and progress, but DON'T pick new songs.
		displayRankings();
		updateProgress();
		saveState();

		songAName.textContent = currentSongA.name;
		songBName.textContent = currentSongB.name;
		chooseABtn.textContent = `I prefer ${currentSongA.name}`;
		chooseBBtn.textContent = `I prefer ${currentSongB.name}`;
		if (chooseAMobileBtn)
			chooseAMobileBtn.textContent = `I prefer ${currentSongA.name}`;
		if (chooseBMobileBtn)
			chooseBMobileBtn.textContent = `I prefer ${currentSongB.name}`;
		audioA.src = getObjectUrl(currentSongA.file);
		audioB.src = getObjectUrl(currentSongB.file);
		// same as matchup setup. buffers on first play.

		if (undoBtn) undoBtn.disabled = true;
	}

	function updateApp() {
		displayRankings();
		updateProgress();
		presentNewPair();
		saveState();
	}

	chooseABtn.addEventListener("click", () => handleChoice("A"));
	chooseBBtn.addEventListener("click", () => handleChoice("B"));

	// keyboard shortcuts. a/l and arrows pick, space skips.
	document.addEventListener("keydown", (e) => {
		if (e.target.tagName === "INPUT") return;
		if (e.key === "a" || e.key === "A") handleChoice("A");
		else if (e.key === "l" || e.key === "L") handleChoice("B");
		else if (e.key === "ArrowLeft") handleChoice("A");
		else if (e.key === "ArrowRight") handleChoice("B");
		else if (e.key === " ") {
			e.preventDefault();
			skipBtn.click();
		}
	});
	if (chooseAMobileBtn)
		chooseAMobileBtn.addEventListener("click", () => handleChoice("A"));
	if (chooseBMobileBtn)
		chooseBMobileBtn.addEventListener("click", () => handleChoice("B"));
	skipBtn.addEventListener("click", () => {
		// skipped matchup
		if (state.preventDuplicates && currentSongA && currentSongB) {
			const pairKey = [currentSongA.id, currentSongB.id]
				.sort((a, b) => a - b)
				.join("-");
			state.recentMatches.push(pairKey);
			if (state.recentMatches.length > 20) state.recentMatches.shift();
		}
		presentNewPair();
		saveState();
	});
	undoBtn.addEventListener("click", undoVote);
	resetBtn.addEventListener("click", resetState);
	previewBtns.forEach((btn) => {
		btn.addEventListener("click", () => {
			// stop playlist if previewing.
			if (isPlaylistPlaying) {
				playlistAudio.pause();
				isPlaylistPlaying = false;
			}
			playPreview(btn.dataset.song);
		});
	});
	fullPlayBtns.forEach((btn) => {
		btn.addEventListener("click", () => playFullSong(btn.dataset.song));
	});
	toggleRankingsBtn.addEventListener("click", () => {
		rankingContainer.classList.toggle("visible");
	});

	let playlist = [];
	let currentPlaylistIndex = 0;
	let isPlaylistPlaying = false;
	let isWeightedPlaylist = false;

	function getWeightForShuffle(song) {
		return Math.max(1, getRating(song));
	}

	function weightedShuffle(songs, getWeight) {
		return [...songs]
			.map((s) => ({ s, key: Math.random() ** (1 / getWeight(s)) }))
			.sort((a, b) => b.key - a.key)
			.map((x) => x.s);
	}

	function generateAndStartPlaylist() {
		const sourceSongs = [...getActiveSongs()].sort(
			(a, b) => getRating(b) - getRating(a),
		);

		if (sourceSongs.length === 0) {
			alert("No songs found for this filter.");
			return;
		}

		playlist = sourceSongs;
		currentPlaylistIndex = 0;
		isWeightedPlaylist = false;

		// show the buttons again.
		playerPrevBtn.style.visibility = "visible";
		playerNextBtn.style.visibility = "visible";

		musicPlayerBar.classList.remove("hidden");
		playSongInPlaylist(currentPlaylistIndex);
	}

	function generateAndStartWeightedPlaylist() {
		const sourceSongs = [...getActiveSongs()];
		if (sourceSongs.length === 0) {
			alert("No songs found. Load a folder first.");
			return;
		}
		playlist = weightedShuffle(sourceSongs, (s) => getWeightForShuffle(s));
		currentPlaylistIndex = 0;
		isWeightedPlaylist = true;
		playerPrevBtn.style.visibility = "visible";
		playerNextBtn.style.visibility = "visible";
		musicPlayerBar.classList.remove("hidden");
		playSongInPlaylist(currentPlaylistIndex);
	}

	function playSongFromCurrentList(index) {
		const sourceSongs = [...getActiveSongs()].sort(
			(a, b) => getRating(b) - getRating(a),
		);

		if (sourceSongs.length === 0 || index < 0 || index >= sourceSongs.length)
			return;

		playlist = sourceSongs;
		currentPlaylistIndex = index;

		playerPrevBtn.style.visibility = "visible";
		playerNextBtn.style.visibility = "visible";
		musicPlayerBar.classList.remove("hidden");
		playSongInPlaylist(currentPlaylistIndex);
	}

	function playSongInPlaylist(index) {
		if (playlist.length === 0) return;
		if (index < 0) index = 0;
		if (index >= playlist.length) {
			if (isWeightedPlaylist) {
				playlist = weightedShuffle([...playlist], (s) => getWeightForShuffle(s));
				index = 0;
			} else {
				return;
			}
		}

		stopAllMusic(); // no overlapping audio.
		currentPlaylistIndex = index;
		const song = playlist[currentPlaylistIndex];

		currentActiveAudio = playlistAudio;
		playerSongName.textContent = `${index + 1}. ${song.name}`;
		playlistAudio.src = getObjectUrl(song.file);
		playlistAudio
			.play()
			.then(() => {
				isPlaylistPlaying = true;
				playerPlayBtn.textContent = "⏸";
			})
			.catch((e) => console.error("Playback failed:", e));
	}

	function togglePlaylistPlay() {
		if (!currentActiveAudio) return;

		if (currentActiveAudio.paused) {
			currentActiveAudio.play();
			if (currentActiveAudio === playlistAudio) isPlaylistPlaying = true;
			playerPlayBtn.textContent = "⏸";
		} else {
			currentActiveAudio.pause();
			if (currentActiveAudio === playlistAudio) isPlaylistPlaying = false;
			playerPlayBtn.textContent = "⏯";
		}
	}

	playListBtn.addEventListener("click", generateAndStartPlaylist);
	if (weightedShuffleBtn)
		weightedShuffleBtn.addEventListener(
			"click",
			generateAndStartWeightedPlaylist,
		);

	playerPrevBtn.addEventListener("click", () =>
		playSongInPlaylist(currentPlaylistIndex - 1),
	);
	playerNextBtn.addEventListener("click", () =>
		playSongInPlaylist(currentPlaylistIndex + 1),
	);

	playerPlayBtn.addEventListener("click", togglePlaylistPlay);

	playerCloseBtn.addEventListener("click", () => {
		stopAllMusic();
		musicPlayerBar.classList.add("hidden");
	});

	playlistAudio.addEventListener("ended", () => {
		playSongInPlaylist(currentPlaylistIndex + 1);
	});

	if (playlistAudio) {
		playlistAudio.addEventListener("error", () => {
			playSongInPlaylist(currentPlaylistIndex + 1);
		});
	}

	// export import keeps ratings around. ratings keyed by path survive
	// folder moves and app updates, i just dump and reload them when needed
	function doExport() {
		try {
			const raw = localStorage.getItem(STATE_KEY);
			if (!raw) {
				alert("Nothing to export yet. Rank some songs first.");
				return;
			}
			const blob = new Blob([raw], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "songRankerBackup.json";
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			alert("Export failed: " + e.message);
		}
	}
	function wireImport(btn, input) {
		if (!btn || !input) return;
		btn.addEventListener("click", () => input.click());
		input.addEventListener("change", async (e) => {
			const file = e.target.files[0];
			if (!file) return;
			try {
				const text = await file.text();
				JSON.parse(text);
				localStorage.setItem(STATE_KEY, text);
				alert("Import done. Reloading.");
				location.reload();
			} catch (err) {
				alert("Import failed: " + err.message);
			}
			e.target.value = "";
		});
	}
	document.getElementById("export-btn")?.addEventListener("click", doExport);
	wireImport(
		document.getElementById("import-btn"),
		document.getElementById("import-input"),
	);

	if (settingsBtn && settingsModal) {
		settingsBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			settingsModal.style.display =
				settingsModal.style.display === "block" ? "none" : "block";
		});
		closeSettingsBtn?.addEventListener(
			"click",
			() => (settingsModal.style.display = "none"),
		);
		document.addEventListener("click", (e) => {
			if (
				settingsModal.style.display === "block" &&
				!settingsModal.contains(e.target) &&
				!settingsBtn.contains(e.target)
			) {
				settingsModal.style.display = "none";
			}
		});
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") settingsModal.style.display = "none";
		});
	}

	// volume
	const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

	function initVolume() {
		if (volumeSlider) {
			if (isIOS) {
				volumeSlider.parentElement.style.display = "none";
				return;
			}

			volumeSlider.value = state.volume;

			const updateVolume = (val) => {
				state.volume = val;
				if (audioA) audioA.volume = val;
				if (audioB) audioB.volume = val;
				if (playlistAudio) playlistAudio.volume = val;
			};

			// init audio elements
			updateVolume(state.volume);

			volumeSlider.addEventListener("input", (e) => {
				updateVolume(parseFloat(e.target.value));
				saveState();
			});
		}
	}
	initVolume();

	function formatTime(seconds) {
		if (isNaN(seconds) || seconds === Infinity) return "0:00";
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}

	function updateProgressBar() {
		if (!currentActiveAudio) return;

		const audio = currentActiveAudio;
		if (audio.duration) {
			const percent = (audio.currentTime / audio.duration) * 100;
			playerProgress.value = percent;
			playerCurrentTime.textContent = formatTime(audio.currentTime);
			playerDuration.textContent = formatTime(audio.duration);
		}

		if (!audio.paused) {
			requestAnimationFrame(updateProgressBar);
		}
	}

	if (playerProgress) {
		const handleSeek = (e) => {
			if (
				!currentActiveAudio ||
				!currentActiveAudio.duration ||
				currentActiveAudio.duration === Infinity
			)
				return;
			const seekTime = (e.target.value / 100) * currentActiveAudio.duration;

			// safari errors if we seek too fast.
			try {
				currentActiveAudio.currentTime = seekTime;
				playerCurrentTime.textContent = formatTime(seekTime);
			} catch (err) {
				console.warn("Seeking failed. Safari being Safari.", err);
			}
		};

		playerProgress.addEventListener("input", handleSeek);
		playerProgress.addEventListener("change", handleSeek);
	}

	[audioA, audioB, playlistAudio].forEach((audio) => {
		audio.addEventListener("play", () =>
			requestAnimationFrame(updateProgressBar),
		);
		audio.addEventListener("loadedmetadata", () => {
			if (currentActiveAudio === audio) {
				playerDuration.textContent = formatTime(audio.duration);
			}
		});
	});

	// refresh on bfcache restore
	window.addEventListener("pageshow", (e) => {
		if (e.persisted) {
			updateApp();
		}
	});

	// on launch, try to reopen the saved folder. the browser never
	// persists the permission, so this is either silent or one click.
	const reconnectBtn = document.getElementById("reconnect-btn");

	function showReconnect(handle) {
		if (!reconnectBtn) return;
		const dropTitle = document.getElementById("drop-title");
		if (dropTitle) dropTitle.textContent = "YOUR SAVED FOLDER IS READY";
		try {
			reconnectBtn.textContent = `Reconnect: ${handle.name}`;
		} catch {
			reconnectBtn.textContent = "Reconnect saved folder";
		}
		// browse stays visible. saved folders can live on a device that gets
		// unplugged, and reconnect alone would leave nowhere to go.
		browseBtn.classList.remove("hidden");
		reconnectBtn.classList.remove("hidden");
		const hint = document.getElementById("reconnect-hint");
		if (hint) hint.classList.remove("hidden");
		setDropStatus("if that folder is gone, choose a different one.");
	}

	reconnectBtn.addEventListener("click", async () => {
		const handle = await loadDirHandle();
		if (!handle) return;
		try {
			const perm = await handle.requestPermission({ mode: "read" });
			if (perm !== "granted") {
				setDropStatus("browser said no to that folder. choose another one below.");
				return;
			}
			reconnectBtn.classList.add("hidden");
			const files = [];
			await walkDirHandle(handle, "", files);
			if (files.length) acceptSongs(files);
		} catch (e) {
			console.error("reconnect failed:", e.message);
			// a handle whose device is gone throws here. silence on the click
			// reads as a broken button, so say what happened.
			setDropStatus("that folder is not reachable. choose a different one.");
		}
	});

	// the header copy says click to browse. body click opens the picker
	// while every button keeps its own listener.
	dropZone.addEventListener("click", (e) => {
		if (e.target.closest("button")) return;
		pickFolder();
	});

	(async () => {
		await initOpfs();

		// copy mode first. songs live in the browser, no permission needed.
		if (isCopyMode() && opfsAvailable) {
			const stored = await loadFromOpfs();
			if (stored.length) {
				acceptSongs(stored);
				return;
			}
		}

		const handle = await loadDirHandle();
		if (handle) {
			try {
				let perm = await handle.queryPermission({ mode: "read" });
				if (perm !== "granted") {
					perm = await handle.requestPermission({ mode: "read" });
				}
				if (perm !== "granted") {
					showReconnect(handle);
					return;
				}
				const files = [];
				await walkDirHandle(handle, "", files);
				if (files.length) {
					acceptSongs(files);
					return;
				}
				showReconnect(handle);
				return;
			} catch (e) {
				console.error("stored folder reopen failed:", e.message);
				showReconnect(handle);
				return;
			}
		}

		// nothing saved. say why and offer the fix.
		updateStorageModeBtn();
		if (!caps.picker) {
			if (isChromium()) {
				setDropStatus(
					"this browser can't remember folders. copies are the safer option: no folder permissions needed. or fix: chrome://flags, enable 'file system access api'. warning: that lets any site read folders you pick, only enable if you trust every site you use.",
				);
			} else {
				setDropStatus(
					"this browser can't remember folders. store a copy instead, uses disk space but you only pick the folder once.",
				);
			}
			showCopyOffer();
		} else if (caps.idb) {
			setDropStatus("no saved folder yet.");
		} else {
			setDropStatus(
				"browser storage is blocked, so the folder can't be remembered.",
			);
		}
	})();
});
