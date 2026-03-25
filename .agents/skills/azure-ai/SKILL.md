---
name: azure-ai
description: "Use for Azure AI: Search, Speech, OpenAI, Document Intelligence. Helps with search, vector/hybrid search, speech-to-text, text-to-speech, transcription, OCR. WHEN: AI Search, query search, vector search, hybrid search, semantic search, speech-to-text, text-to-speech, transcribe, OCR, convert text to speech."
---

# Azure AI Services

Guide for using Azure AI services: AI Search, Speech, OpenAI, and Document Intelligence.

## Service Selection

| Service | Use When | CLI |
|---------|----------|-----|
| **AI Search** | Full-text, vector, or hybrid search | `az search` |
| **Speech** | Speech-to-text, text-to-speech, translation | `az cognitiveservices` |
| **OpenAI** | GPT models, embeddings, DALL-E | `az cognitiveservices` |
| **Document Intelligence** | OCR, form recognition, document analysis | `az cognitiveservices` |

## Azure AI Search

### Create Search Service
```bash
az search service create --name <NAME> -g <RG> --sku standard --location <REGION>
az search admin-key show --service-name <NAME> -g <RG>
```

### Create Index
```bash
az search index create --service-name <NAME> --name <INDEX> \
  --fields "id:Edm.String:key, title:Edm.String:searchable, content:Edm.String:searchable"
```

### Vector Search Setup
- Create an index with vector fields (Edm.Single collection)
- Configure vector search algorithms (HNSW recommended)
- Use Azure OpenAI embeddings for vectorization

## Azure OpenAI

```bash
az cognitiveservices account create --name <NAME> -g <RG> \
  --kind OpenAI --sku S0 --location <REGION>

az cognitiveservices account deployment create --name <NAME> -g <RG> \
  --deployment-name gpt-4 --model-name gpt-4 --model-version <VERSION> \
  --model-format OpenAI --sku-capacity 10 --sku-name Standard
```

## Azure Speech

```bash
az cognitiveservices account create --name <NAME> -g <RG> \
  --kind SpeechServices --sku S0 --location <REGION>

az cognitiveservices account keys list --name <NAME> -g <RG>
```

## Document Intelligence

```bash
az cognitiveservices account create --name <NAME> -g <RG> \
  --kind FormRecognizer --sku S0 --location <REGION>
```

## Best Practices
- Use managed identity for service-to-service authentication
- Enable diagnostic logging for all AI services
- Set up rate limiting and cost alerts
- Use private endpoints for production deployments
