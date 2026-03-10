import WaveSurfer from 'wavesurfer.js';
import type { WaveSurferOptions } from 'wavesurfer.js';

export function createWaveSurfer(container: HTMLElement, options: Partial<WaveSurferOptions> = {}) {
  return new WaveSurfer({
    container,
    waveColor: '#a0aec0',
    progressColor: '#3182ce',
    cursorColor: '#2d3748',
    height: 80,
    ...options,
  });
}
