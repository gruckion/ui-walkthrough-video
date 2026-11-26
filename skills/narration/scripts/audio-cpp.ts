// Text to speech through audio.cpp's C library, called from Node with koffi.
// Ported from T3 Code's audio.cpp bindings (packages/audio-cpp), which load the same release.
import koffi, { type TypeObject } from 'koffi';

export type Audio = {
  /** Interleaved samples in [-1, 1]. */
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly channels: number;
};

export type SpeechRequest = {
  readonly text: string;
  /** Omit when the model should pick its own language. */
  readonly language?: string;
  /** Options the model declares, such as `voice_id` or `speed`. */
  readonly options?: Readonly<Record<string, string>>;
};

export type SpeechModel = {
  readonly backend: string;
  /** All audio for `request`, joined in order. */
  readonly speak: (request: SpeechRequest) => Audio;
  readonly dispose: () => void;
};

/** Loads a streaming text-to-speech model, falling back to the CPU when `backend` fails. */
export function loadSpeechModel(
  libraryPath: string,
  modelPath: string,
  { backend, threads }: { readonly backend: string; readonly threads: number },
): SpeechModel {
  const lib = koffi.load(libraryPath);
  const Registry = koffi.pointer(koffi.opaque());
  const Model = koffi.pointer(koffi.opaque());
  const Session = koffi.pointer(koffi.opaque());
  const Request = koffi.pointer(koffi.opaque());
  const Result = koffi.pointer(koffi.opaque());
  const Event = koffi.pointer(koffi.opaque());
  const BackendConfig = koffi.struct({ backend: 'const char *', device: 'int', threads: 'int' });
  const out = (type: string | TypeObject) => koffi.out(koffi.pointer(type));
  const native = {
    abiVersion: lib.func('audiocpp_abi_version', 'uint32_t', []),
    lastError: lib.func('audiocpp_last_error', 'const char *', []),
    statusString: lib.func('audiocpp_status_string', 'const char *', ['int']),
    registryCreate: lib.func('audiocpp_registry_create', 'int', ['const char *', out(Registry)]),
    registryFree: lib.func('audiocpp_registry_free', 'void', [Registry]),
    modelLoad: lib.func('audiocpp_model_load', 'int', [Registry, 'const char *', 'void *', 'void *', out(Model)]),
    modelFree: lib.func('audiocpp_model_free', 'void', [Model]),
    modelSupports: lib.func('audiocpp_model_supports', 'int', [Model, 'const char *', 'const char *']),
    sessionCreate: lib.func('audiocpp_session_create', 'int', [
      Model, 'const char *', 'const char *', koffi.pointer(BackendConfig), 'void *', out(Session),
    ]),
    sessionFree: lib.func('audiocpp_session_free', 'void', [Session]),
    streamStart: lib.func('audiocpp_stream_start', 'int', [Session, Request]),
    streamNextEvent: lib.func('audiocpp_stream_next_event', 'int', [Session, out(Event)]),
    streamReset: lib.func('audiocpp_stream_reset', 'int', [Session]),
    eventFree: lib.func('audiocpp_event_free', 'void', [Event]),
    eventAsResult: lib.func('audiocpp_event_as_result', Result, [Event]),
    namedAudioCount: lib.func('audiocpp_result_named_audio_count', 'size_t', [Result]),
    resultAudio: lib.func('audiocpp_result_audio', 'int', [Result, out('void *'), out('size_t'), out('int'), out('int')]),
    namedAudio: lib.func('audiocpp_result_named_audio', 'int', [
      Result, 'size_t', out('const char *'), out('void *'), out('size_t'), out('int'), out('int'),
    ]),
    requestCreate: lib.func('audiocpp_request_create', Request, []),
    requestFree: lib.func('audiocpp_request_free', 'void', [Request]),
    requestSetText: lib.func('audiocpp_request_set_text', 'int', [Request, 'const char *', 'const char *']),
    requestSetOption: lib.func('audiocpp_request_set_option', 'int', [Request, 'const char *', 'const char *']),
  };
  // These signatures describe major ABI 0.
  if (native.abiVersion() >>> 16 !== 0) throw new Error('Unsupported audio.cpp ABI version.');
  const check = (status: number, operation: string) => {
    if (status === 0) return;
    const detail: unknown = native.lastError();
    throw new Error(`audio.cpp ${operation} failed (${String(native.statusString(status))})${detail ? `: ${String(detail)}` : ''}`);
  };

  const registry: [unknown] = [null];
  check(native.registryCreate(null, registry), 'registry creation');
  const loaded: [unknown] = [null];
  check(native.modelLoad(registry[0], modelPath, null, null, loaded), 'model load');
  const model = loaded[0];
  const openSession = (sessionBackend: string) => {
    const session: [unknown] = [null];
    check(native.sessionCreate(model, 'tts', 'streaming', { backend: sessionBackend, device: 0, threads }, null, session), `${sessionBackend} session creation`);
    return session[0];
  };
  let session: unknown;
  let sessionBackend = backend;
  try {
    if (!native.modelSupports(model, 'tts', 'streaming')) throw new Error('This model does not support streaming text to speech.');
    try {
      session = openSession(backend);
    } catch (error) {
      if (backend === 'cpu') throw error;
      sessionBackend = 'cpu';
      session = openSession('cpu');
    }
  } catch (error) {
    native.modelFree(model);
    native.registryFree(registry[0]);
    throw error;
  }

  // Reads one event's audio. Copies it out before the event is freed: koffi.decode copies,
  // while koffi.view would wrap native memory, which Electron's V8 refuses.
  const readEvent = (event: unknown): Audio => {
    try {
      const samples: [unknown] = [null];
      const frames: [number | bigint] = [0];
      const sampleRate: [number] = [0];
      const channels: [number] = [0];
      const result = native.eventAsResult(event);
      check(
        Number(native.namedAudioCount(result)) > 0
          ? native.namedAudio(result, 0, [''], samples, frames, sampleRate, channels)
          : native.resultAudio(result, samples, frames, sampleRate, channels),
        'audio read',
      );
      const length = Number(frames[0]) * channels[0];
      const copy: Float32Array = length ? koffi.decode(samples[0], koffi.array('float', length, 'Typed')) : new Float32Array(0);
      return { samples: copy, sampleRate: sampleRate[0], channels: channels[0] };
    } finally {
      native.eventFree(event);
    }
  };

  return {
    backend: sessionBackend,
    speak({ text, language, options = {} }) {
      const request = native.requestCreate();
      if (!request) throw new Error('audio.cpp could not allocate a request.');
      try {
        check(native.requestSetText(request, text, language ?? null), 'request text');
        for (const [key, value] of Object.entries(options)) check(native.requestSetOption(request, key, value), `request option ${key}`);
        check(native.streamStart(session, request), 'stream start');
      } finally {
        native.requestFree(request);
      }
      const parts: Audio[] = [];
      try {
        for (;;) {
          const event: [unknown] = [null];
          check(native.streamNextEvent(session, event), 'synthesis');
          if (!event[0]) break;
          parts.push(readEvent(event[0]));
        }
      } finally {
        native.streamReset(session);
      }
      const first = parts[0];
      if (!first) throw new Error('audio.cpp returned no audio.');
      const joined = new Float32Array(parts.reduce((n, part) => n + part.samples.length, 0));
      let offset = 0;
      for (const part of parts) {
        if (part.sampleRate !== first.sampleRate || part.channels !== first.channels) throw new Error('audio.cpp changed the audio format mid-stream.');
        joined.set(part.samples, offset);
        offset += part.samples.length;
      }
      return { samples: joined, sampleRate: first.sampleRate, channels: first.channels };
    },
    dispose() {
      native.sessionFree(session);
      native.modelFree(model);
      native.registryFree(registry[0]);
    },
  };
}
