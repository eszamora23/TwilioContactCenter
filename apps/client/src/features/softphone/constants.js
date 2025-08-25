export const SOFTPHONE_CHANNEL_KEY = 'softphone-control';

/**
 * Features agresivos para forzar "popup window" (no tab).
 * Algunos navegadores o políticas corporativas pueden seguir forzando tabs,
 * pero esta combinación maximiza la probabilidad de ventana separada.
 */
export const SOFTPHONE_POPUP_FEATURES = [
  // minimizar UI del navegador
  'popup=1',
  'noopener',
  'noreferrer',
  'toolbar=0',
  'menubar=0',
  'location=0',
  'status=0',
  'directories=0',
  'personalbar=0',
  'titlebar=0',

  // dimensiones y posición
  'width=420',
  'height=640',
  'left=120',
  'top=80',

  // comportamiento
  'scrollbars=1',
  'resizable=1',
  'dependent=yes',
  'dialog=yes'
].join(',');
