# Plan: YouTube Iframe Player jako domyślna metoda odtwarzania

## Cel
Zmiana domyślnej metody odtwarzania z yt-dlp na YouTube iframe embed, z opcjonalnym opt-in dla yt-dlp w ustawieniach zaawansowanych.

## Wymagania
1. **Domyślnie**: YouTube iframe (bez wymagania yt-dlp)
2. **Własne kontrolki**: Ukryj kontrolki YouTube (`controls=0`), używaj obecnych PlayerControls
3. **Oba okna**: VideoPlayer i DetachedPlayer używają iframe
4. **Auto-detect**: Opcja yt-dlp widoczna tylko gdy wykryty w systemie
5. **Overlaye**: NextSongOverlay, CurrentSingerOverlay muszą działać na iframe

---

## Nowe pliki do utworzenia

### 1. `/src/services/youtubeIframe.ts`
Ładowanie YouTube IFrame API dynamicznie:
- Funkcja `loadYouTubeAPI()` - zwraca Promise z YT.Player
- Singleton pattern - ładuj API tylko raz

### 2. `/src/types/youtube-iframe.d.ts`
Definicje TypeScript dla YouTube IFrame API (YT.Player, PlayerVars, Events)

### 3. `/src/components/player/YouTubePlayer.tsx`
Nowy komponent opakowujący YouTube IFrame:
```typescript
interface YouTubePlayerProps {
  videoId: string;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  seekTime: number | null;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onEnded: () => void;
  onError: (errorCode: number) => void;
}
```
- `playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, fs: 0 }`
- Polling co 250ms dla time updates (YouTube API nie ma continuous event)

### 4. `/src/components/player/NativePlayer.tsx`
Wyciągnięcie logiki HTML5 `<video>` z VideoPlayer.tsx do oddzielnego komponentu:
```typescript
interface NativePlayerProps {
  streamUrl: string;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  seekTime: number | null;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onEnded: () => void;
  onError: () => void;
}
```

---

## Pliki do modyfikacji

### 5. `/src/stores/settingsStore.ts`
Dodać nowe ustawienie:
```typescript
SETTINGS_KEYS = {
  ...existing,
  PLAYBACK_MODE: "playback_mode",  // 'youtube' | 'ytdlp'
}

SETTINGS_DEFAULTS = {
  ...existing,
  [SETTINGS_KEYS.PLAYBACK_MODE]: "youtube",
}

// Nowy stan:
ytDlpAvailable: boolean;
setYtDlpAvailable: (available: boolean) => void;
```

### 6. `/src-tauri/src/commands/settings.rs`
Dodać `"playback_mode"` do `ALLOWED_SETTING_KEYS`

### 7. `/src/components/settings/SettingsDialog.tsx`
W Advanced tab dodać (tylko gdy `ytDlpAvailable`):
```tsx
<SettingRow
  label="Video Streaming Mode"
  description="YouTube embed is simpler; yt-dlp provides higher quality"
>
  <SelectInput
    value={getSetting(SETTINGS_KEYS.PLAYBACK_MODE)}
    options={[
      { value: "youtube", label: "YouTube Embed (default)" },
      { value: "ytdlp", label: "yt-dlp (advanced)" },
    ]}
  />
</SettingRow>
```

### 8. `/src/components/player/VideoPlayer.tsx`
Orchestracja między YouTubePlayer i NativePlayer:
```tsx
const playbackMode = useSettingsStore(s => s.getSetting(SETTINGS_KEYS.PLAYBACK_MODE));

return (
  <div className="relative w-full h-full">
    {playbackMode === 'ytdlp' && currentVideo?.streamUrl ? (
      <NativePlayer streamUrl={currentVideo.streamUrl} ... />
    ) : currentVideo?.youtubeId ? (
      <YouTubePlayer videoId={currentVideo.youtubeId} ... />
    ) : (
      <Placeholder />
    )}
    {/* Overlaye na wierzchu */}
    <CurrentSingerOverlay />
    <NextSongOverlay />
  </div>
);
```

### 9. `/src/components/player/DetachedPlayer.tsx`
Taka sama logika jak VideoPlayer - wybór między YouTubePlayer i NativePlayer

### 10. `/src/stores/playerStore.ts`
Modyfikacja `playVideo()`:
```typescript
export async function playVideo(video: Video): Promise<void> {
  const playbackMode = useSettingsStore.getState().getSetting(SETTINGS_KEYS.PLAYBACK_MODE);

  if (playbackMode === 'youtube') {
    // Nie potrzeba stream URL
    setCurrentVideo(video);
    setIsPlaying(true);
    return;
  }

  // Istniejąca logika yt-dlp...
}
```

### 11. `/src/services/windowManager.ts`
Aktualizacja PlayerState:
```typescript
interface PlayerState {
  ...existing,
  videoId: string | null;
  playbackMode: 'youtube' | 'ytdlp';
}
```

### 12. `/src/components/DependencyCheck.tsx`
Zmiana z blokującego na informacyjny:
- Sprawdź yt-dlp, zapisz wynik w settingsStore
- Zawsze kontynuuj do aplikacji (YouTube iframe nie wymaga yt-dlp)
- Usuń ekran błędu "yt-dlp not found"

---

## Sekwencja implementacji

1. **Utworzenie podstaw** - youtubeIframe.ts, types, YouTubePlayer.tsx
2. **Ekstrakcja NativePlayer** - wyciągnięcie logiki video z VideoPlayer
3. **Ustawienia** - PLAYBACK_MODE w settingsStore, allowlist, UI w Advanced
4. **Integracja VideoPlayer** - switch między YouTube i Native
5. **DetachedPlayer** - ta sama logika dual-mode
6. **DependencyCheck** - zmiana na non-blocking
7. **Testy** - oba tryby, oba okna, overlaye

---

## Edge cases

| Przypadek | Rozwiązanie |
|-----------|-------------|
| YouTube API nie ładuje się | Retry + fallback na yt-dlp (jeśli dostępne) |
| Video ma wyłączone embedding (error 101/150) | Pokaż komunikat + sugestia yt-dlp |
| Brak internetu | YouTube iframe nie działa; yt-dlp może użyć cache |
| Tauri webview blokuje iframe | Sprawdzić CSP w tauri.conf.json |

---

## Kluczowe pliki (ścieżki pełne)

**Nowe:**
- `src/services/youtubeIframe.ts`
- `src/types/youtube-iframe.d.ts`
- `src/components/player/YouTubePlayer.tsx`
- `src/components/player/NativePlayer.tsx`

**Modyfikowane:**
- `src/stores/settingsStore.ts`
- `src-tauri/src/commands/settings.rs`
- `src/components/settings/SettingsDialog.tsx`
- `src/components/player/VideoPlayer.tsx`
- `src/components/player/DetachedPlayer.tsx`
- `src/stores/playerStore.ts`
- `src/services/windowManager.ts`
- `src/components/DependencyCheck.tsx`
