import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createTranslationHandler } from './translate.mjs';

const openaiKey = defineSecret('OPENAI_API_KEY');
const handler = createTranslationHandler({
  apiKey: () => openaiKey.value(),
  allowedOrigins: ['https://meoyaho.github.io'],
});

export const translate = onRequest({
  region: 'asia-northeast3',
  secrets: [openaiKey],
  invoker: 'public',
  cors: false, // The handler explicitly validates origins and handles preflight.
  memory: '256MiB',
  cpu: 'gcf_gen1',
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  timeoutSeconds: 35,
}, handler);
