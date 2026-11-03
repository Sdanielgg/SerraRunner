# Engine loops

Original synthesized engine sounds for Serra Runner. Generated deterministically
with `npm run audio:generate`; no recordings or third-party samples are used.

Each asset is a sixteen-second, mono, 16-bit PCM WAV at 22050 Hz. All oscillators
complete whole cycles across the loop boundary. Playback rate and gain are
controlled in game; the base pulse is 30 Hz for Crawler, 40 Hz for Jeep and
55 Hz for Rally. Keep these WAV files in the repository so a fresh clone can
build and play without generating assets first. Sounds are cached on the device
before playback, and longer clips reduce the frequency of native loop transitions.
