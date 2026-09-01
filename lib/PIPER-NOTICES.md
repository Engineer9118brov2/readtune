# Piper runtime notices

ReadTune bundles the following files only to run the optional, on-device Piper
voice. No remote JavaScript or WASM is executed.

- `lib/ort/` is ONNX Runtime Web 1.18.0, Copyright Microsoft, MIT License.
- `shared/piper/` is `@mintplex-labs/piper-tts-web` 1.0.5, MIT License.
- `lib/piper/` is `@diffusionstudio/piper-wasm` 1.0.0, MIT License.

The voice model itself is not bundled. When a reader explicitly selects Piper,
the extension asks permission to download the selected model from Hugging Face.
That model is cached in the browser's origin-private file system and the text
being spoken is processed locally.
