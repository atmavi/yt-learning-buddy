import * as dotenv from 'dotenv';
import weaviate, { WeaviateClient, ApiKey, vectors, configure } from 'weaviate-client';
import { YoutubeTranscript } from 'youtube-transcript';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Load .env file for local development
dotenv.config();

async function setupYoutubeRAG(videoUrl: string) {
  try {
    // Get environment variables (from dotenv locally, or from Firebase runtime in production)
    const weaviateUrl = process.env.WEAVIATE_URL;
    const weaviateApiKey = process.env.WEAVIATE_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!weaviateUrl || !weaviateApiKey || !openaiApiKey) {
      throw new Error("Missing required environment variables: WEAVIATE_URL, WEAVIATE_API_KEY, OPENAI_API_KEY");
    }

    // 1. Setup Weaviate Client
    // const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
    //   weaviateUrl, {
    //     authCredentials: new ApiKey(weaviateApiKey),
    //     headers: {
    //       'X-OpenAI-Api-Key': openaiApiKey, // To automatically turn text into vectors
    //     }
    //   }
    // );

    const client: WeaviateClient = await weaviate.connectToLocal({
      host: 'localhost',
      port: 8080,
      headers: {
        'X-OpenAI-Api-Key': openaiApiKey, 
      }
    });

    // 2. Create the Collection (Schema)
    const collectionName = 'YoutubeLesson';
    
    // Check if it exists, delete if you want a fresh start for the demo
    if (await client.collections.exists(collectionName)) {
      await client.collections.delete(collectionName);
    }

    const lessons = await client.collections.create({
      name: collectionName,
      vectorizers: vectors.text2VecOpenAI(), // Automatically vectorizes your content
      generative: configure.generative.openAI(), // Enables "RAG" (Generative Search)
    });

    // 3. Get Transcripts and Chunk them
    console.log("Fetching transcript...");
    const transcript = await YoutubeTranscript.fetchTranscript(videoUrl);
    
    // Combine small transcript bits into 500-word chunks
    const chunks = [];
    let currentChunk = "";
    for (const entry of transcript) {
      currentChunk += entry.text + " ";
      if (currentChunk.split(" ").length > 500) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
    }

    // 4. Batch Import into Weaviate
    console.log(`Importing ${chunks.length} chunks...`);
    await lessons.data.insertMany(
      chunks.map(text => ({
        content: text,
        videoUrl: videoUrl
      }))
    );

    console.log("Ingestion Complete!");

    // 5. The "RAG" Query
    const query = "How do I start the project?";
    const result = await lessons.generate.nearText(query, {
      singlePrompt: `You are a helpful study assistant. Using this video transcript: {content}, answer this: ${query}`,
    }, {
      limit: 2
    });

    console.log("\n--- AI ANSWER ---");
    console.log(result.objects[0].generated);

  } catch (error) {
    console.error("Error:", error);
  }
}

// Export as a Cloud Function (HTTP callable)
export const processYoutubeVideo = onCall(async (request) => {
  const videoUrl = request.data.videoUrl;
  
  if (!videoUrl) {
    throw new HttpsError('invalid-argument', 'videoUrl is required');
  }
  
  await setupYoutubeRAG(videoUrl);
  return { message: 'Video processed successfully' };
});