import weaviate, { WeaviateClient, ApiKey, vectors, configure } from 'weaviate-client';
import { YoutubeTranscript } from 'youtube-transcript';

// 1. Setup Weaviate Client
const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
  'https://your-sandbox-url.weaviate.network', {
    authCredentials: new ApiKey('YOUR-WEAVIATE-API-KEY'),
    headers: {
      'X-OpenAI-Api-Key': 'YOUR-OPENAI-KEY', // To automatically turn text into vectors
    }
  }
);

async function setupYoutubeRAG(videoUrl: string) {
  try {
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
  } finally {
    client.close();
  }
}

setupYoutubeRAG(`https://www.youtube.com/watch?v=F2OpUJsf68g`);