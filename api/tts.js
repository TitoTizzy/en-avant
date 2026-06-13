// POST /api/tts — Text-to-Speech ElevenLabs (DAT Corr. 4)
// Flux : { article_id } → cache (articles.audio_url) → sinon appel ElevenLabs
// côté serveur → MP3 stocké dans le bucket public `tts-articles` → URL retournée.
// La clé ElevenLabs ne quitte jamais le serveur ; le frontend ne reçoit qu'une URL.
import { getServiceClient } from './_lib/supabase.js';
import { json, methodGuard, getBody, handleError } from './_lib/http.js';

const MAX_CHARS = 4800; // limite raisonnable par article (coût + durée)

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const { article_id: articleId } = getBody(req);
    if (typeof articleId !== 'string' || !/^[0-9a-f-]{36}$/i.test(articleId)) {
      return json(res, 422, { error: 'article_id (UUID) requis.' });
    }

    const supabase = getServiceClient();
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('id, titre, contenu, audio_url, published')
      .eq('id', articleId)
      .single();

    if (articleError || !article || !article.published) {
      return json(res, 404, { error: 'Article introuvable.' });
    }

    // Cache (DAT) : si le MP3 existe déjà, zéro appel ElevenLabs.
    if (article.audio_url) {
      return json(res, 200, { url: article.audio_url, cached: true });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!apiKey || !voiceId) {
      return json(res, 503, { error: 'Le service audio n\'est pas encore configuré.' });
    }

    // Texte propre : balises HTML retirées, longueur bornée.
    const plain = `${article.titre}. ${article.contenu}`
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CHARS);

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: plain,
          model_id: 'eleven_multilingual_v2', // bon rendu en français
        }),
      }
    );

    if (!ttsResponse.ok) {
      console.error('ElevenLabs:', ttsResponse.status, await ttsResponse.text());
      return json(res, 502, { error: 'Le service audio est momentanément indisponible.' });
    }

    const mp3 = Buffer.from(await ttsResponse.arrayBuffer());
    const filePath = `${article.id}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from('tts-articles')
      .upload(filePath, mp3, { contentType: 'audio/mpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabase.storage.from('tts-articles').getPublicUrl(filePath);
    const url = publicUrl.publicUrl;

    await supabase.from('articles').update({ audio_url: url }).eq('id', article.id);

    return json(res, 200, { url, cached: false });
  } catch (error) {
    return handleError(res, error, 'Échec de la génération audio.');
  }
}
