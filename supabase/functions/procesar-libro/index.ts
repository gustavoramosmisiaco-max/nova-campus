// supabase/functions/procesar-libro/index.ts
//
// Qué hace esta función:
// 1. Recibe el ID de un libro ya subido a Storage
// 2. Descarga el PDF
// 3. Sube el PDF a Gemini (File API) y le pide que devuelva el texto completo
// 4. Trocea ese texto en fragmentos (~1000 caracteres c/u)
// 5. Genera el embedding de cada fragmento
// 6. Guarda todo en la tabla fragmentos_libro
// 7. Marca el libro como procesado = true

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Trocea el texto en fragmentos con superposición para no cortar ideas a la mitad ---
function trocearTexto(texto: string, tamanoFragmento = 1000, superposicion = 150): string[] {
  const fragmentos: string[] = [];
  let inicio = 0;

  while (inicio < texto.length) {
    const fin = Math.min(inicio + tamanoFragmento, texto.length);
    fragmentos.push(texto.slice(inicio, fin));
    inicio += tamanoFragmento - superposicion;
  }

  return fragmentos.filter((f) => f.trim().length > 50);
}

// --- Sube el PDF a Gemini File API ---
async function subirPDFAGemini(pdfBuffer: ArrayBuffer, nombreArchivo: string): Promise<string> {
  const bytes = new Uint8Array(pdfBuffer);

  const respuestaInicio = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "raw",
        "X-Goog-Upload-Command": "upload, finalize",
        "Content-Type": "application/pdf",
        "X-Goog-File-Name": nombreArchivo,
      },
      body: bytes,
    }
  );

  if (!respuestaInicio.ok) {
    throw new Error(`Error subiendo PDF a Gemini: ${await respuestaInicio.text()}`);
  }

  const data = await respuestaInicio.json();
  return data.file.uri; // ej: "files/abc123"
}

// --- Pide a Gemini que extraiga el texto completo del PDF subido ---
async function extraerTextoConGemini(fileUri: string): Promise<string> {
  const respuesta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { file_data: { file_uri: fileUri, mime_type: "application/pdf" } },
              {
                text: "Extrae todo el texto de este documento tal cual está, sin resumir ni omitir nada. Devuelve solo el texto plano, sin comentarios adicionales.",
              },
            ],
          },
        ],
      }),
    }
  );

  if (!respuesta.ok) {
    throw new Error(`Error extrayendo texto: ${await respuesta.text()}`);
  }

  const data = await respuesta.json();
  return data.candidates[0].content.parts[0].text;
}

// --- Genera el embedding de un fragmento de texto ---
async function generarEmbedding(texto: string): Promise<number[]> {
  const respuesta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text: texto }] },
      }),
    }
  );

  if (!respuesta.ok) {
    throw new Error(`Error generando embedding: ${await respuesta.text()}`);
  }

  const data = await respuesta.json();
  return data.embedding.values;
}

serve(async (req) => {
  try {
    const { libro_id } = await req.json();

    if (!libro_id) {
      return new Response(JSON.stringify({ error: "Falta libro_id" }), { status: 400 });
    }

    // 1. Obtener info del libro
    const { data: libro, error: errorLibro } = await supabase
      .from("libros")
      .select("*")
      .eq("id", libro_id)
      .single();

    if (errorLibro || !libro) {
      return new Response(JSON.stringify({ error: "Libro no encontrado" }), { status: 404 });
    }

    // 2. Descargar el PDF desde Storage
    const { data: archivo, error: errorArchivo } = await supabase.storage
      .from("libros")
      .download(libro.archivo_path);

    if (errorArchivo || !archivo) {
      return new Response(JSON.stringify({ error: "No se pudo descargar el archivo" }), { status: 404 });
    }

    const pdfBuffer = await archivo.arrayBuffer();

    // 3. Subir el PDF a Gemini y extraer su texto
    const fileUri = await subirPDFAGemini(pdfBuffer, libro.titulo);
    const texto = await extraerTextoConGemini(fileUri);

    // 4. Trocear el texto
    const fragmentos = trocearTexto(texto);

    // 5. Generar embeddings y guardar cada fragmento
    let procesados = 0;
    for (const fragmento of fragmentos) {
      const embedding = await generarEmbedding(fragmento);

      await supabase.from("fragmentos_libro").insert({
        libro_id: libro.id,
        contenido: fragmento,
        embedding,
      });

      procesados++;
    }

    // 6. Marcar el libro como procesado
    await supabase.from("libros").update({ procesado: true }).eq("id", libro_id);

    return new Response(
      JSON.stringify({ ok: true, fragmentos_procesados: procesados }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});