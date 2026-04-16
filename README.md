#Install deps
cd functions
npm install

#ENV Vars
firebase functions:secrets:set WEAVIATE_URL="your-url"
firebase functions:secrets:set WEAVIATE_API_KEY="your-key"
firebase functions:secrets:set OPENAI_API_KEY="your-key"
