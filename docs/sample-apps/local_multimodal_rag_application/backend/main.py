from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List
import pixeltable as pxt
from pixeltable.iterators import DocumentSplitter
from pixeltable.functions.huggingface import sentence_transformer
from pixeltable.functions import openai
from pixeltable.functions.video import extract_audio
from datetime import datetime
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv
import os
from fastapi import HTTPException
from typing import Dict
import tempfile
import atexit
import shutil

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Configure upload directory
TEMP_DIR = tempfile.mkdtemp()
atexit.register(shutil.rmtree, TEMP_DIR)
logger.info(f"Temporary directory: {Path(TEMP_DIR).absolute()}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    message: str

# Create prompt function
@pxt.udf
def create_prompt(doc_context: list[dict], video_context: list[dict], audio_context: list[dict], question: str) -> str:
    context_parts = []

    if doc_context:
        context_parts.append("Document Context:\n" + "\n\n".join(item['text'] for item in doc_context if item and 'text' in item))

    if video_context:
        context_parts.append("Video Context:\n" + "\n\n".join(item['text'] for item in video_context if item and 'text' in item))

    if audio_context:
        context_parts.append("Audio Context:\n" + "\n\n".join(item['text'] for item in audio_context if item and 'text' in item))

    full_context = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant context found."

    return f"Context:\n{full_context}\n\nQuestion:\n{question}"

@pxt.udf
def create_messages(prompt: str) -> list[dict]:
    history = conversations.order_by(
        conversations.timestamp
    ).select(
        conversations.role,
        conversations.content
    ).collect().to_pandas()

    messages = [{
        'role': 'system',
        'content': '''You are a helpful AI assistant maintaining conversation context while answering questions based on provided sources.'''
    }]

    for _, row in history.iterrows():
        messages.append({
            'role': row['role'],
            'content': row['content']
        })

    messages.append({
        'role': 'user',
        'content': prompt
    })

    return messages

# Initialize Pixeltable
pxt.drop_dir('chatbot', force=True)
pxt.create_dir('chatbot')
logger.info("Created Pixeltable directory")

docs_table = pxt.create_table(
    'chatbot.documents',
    {
        'document': pxt.Document,
        'video': pxt.Video,
        'audio': pxt.Audio,
        'question': pxt.String
    }
)

conversations = pxt.create_table(
    'chatbot.conversations',
    {
        'role': pxt.String,
        'content': pxt.String,
        'timestamp': pxt.Timestamp
    }
)

# Add computed columns for video processing
docs_table['audio_extract'] = extract_audio(docs_table.video, format='mp3')
docs_table['transcription'] = openai.transcriptions(audio=docs_table.audio_extract, model='whisper-1')
docs_table['audio_transcription'] = openai.transcriptions(audio=docs_table.audio, model='whisper-1')
docs_table['audio_transcription_text'] = docs_table.audio_transcription.text
docs_table['transcription_text'] = docs_table.transcription.text

logger.info("Created documents table")

# Create chunks view
chunks_view = pxt.create_view(
    'chatbot.chunks',
    docs_table,
    iterator=DocumentSplitter.create(
            document=docs_table.document,
            separators='sentence',
            metadata='title,heading,sourceline'
        )
)

logger.info("Created chunks view")

from pixeltable.iterators.string import StringSplitter

# Create view for chunking transcriptions
transcription_chunks = pxt.create_view(
    'chatbot.transcription_chunks',
    docs_table,
    iterator=StringSplitter.create(
        text=docs_table.transcription_text,
        separators='sentence'
    )
)

audio_chunks = pxt.create_view(
    'chatbot.audio_chunks',
    docs_table,
    iterator=StringSplitter.create(
        text=docs_table.audio_transcription_text,
        separators='sentence'
    )
)

# Add embedding index to document chunks
chunks_view.add_embedding_index('text', string_embed=sentence_transformer.using(model_id='intfloat/e5-large-v2'))

# Add embedding index to transcription chunks
transcription_chunks.add_embedding_index('text', string_embed=sentence_transformer.using(model_id='intfloat/e5-large-v2'))

audio_chunks.add_embedding_index('text', string_embed=sentence_transformer.using(model_id='intfloat/e5-large-v2'))

logger.info("Added embedding index")

# Setup similarity search query
@chunks_view.query
def get_relevant_chunks(query_text: str):
    sim = chunks_view.text.similarity(query_text)
    return (
        chunks_view.order_by(sim, asc=False)
        .select(chunks_view.text, sim=sim)
        .limit(20)
    )

@transcription_chunks.query
def get_relevant_transcript_chunks(query_text: str):
    sim = transcription_chunks.text.similarity(query_text)
    return (
        transcription_chunks.order_by(sim, asc=False)
        .select(transcription_chunks.text, sim=sim)
        .limit(20)
    )

@audio_chunks.query
def get_relevant_audio_chunks(query_text: str):
    sim = audio_chunks.text.similarity(query_text)
    return audio_chunks.order_by(sim, asc=False).select(audio_chunks.text, sim=sim).limit(20)

# Add computed columns
docs_table['context_doc'] = chunks_view.queries.get_relevant_chunks(docs_table.question)
docs_table['context_video'] = transcription_chunks.queries.get_relevant_transcript_chunks(docs_table.question)
docs_table['context_audio'] = audio_chunks.queries.get_relevant_audio_chunks(docs_table.question)
docs_table['prompt'] = create_prompt(
    docs_table.context_doc,
    docs_table.context_video,
    docs_table.context_audio,
    docs_table.question
)
docs_table['messages'] = create_messages(
    prompt=docs_table.prompt
)

docs_table['response'] = openai.chat_completions(
            messages=docs_table.messages,
            model='gpt-4o-mini',
        )

# Extract the answer text from the API response
docs_table['answer'] = docs_table.response.choices[0].message.content

logger.info("Setup complete")

ALLOWED_TYPES = {
    'document': [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/x-python'
    ],
    'video': [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm'
    ],
    'audio': [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm'
]
}

async def process_document(file_path: Path) -> bool:
    try:
        if file_path.suffix.lower() == '.py':
            # Create markdown file with Python syntax highlighting
            md_path = file_path.with_suffix('.md')
            with open(file_path, 'r', encoding='utf-8') as py_file:
                content = py_file.read()
            with open(md_path, 'w', encoding='utf-8') as md_file:
                md_file.write(f"```python\n{content}\n```")
            file_path = md_path

        abs_path = str(file_path.absolute()).replace(os.sep, '/')
        logger.info(f"Processing document: {abs_path}")

        docs_table = pxt.get_table('chatbot.documents')
        docs_table.insert([{
            'document': abs_path
        }])
        return True

    except Exception as e:
        logger.error(f"Error processing document: {e}")
        raise

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    logger.info(f"Received file upload request: {file.filename}")
    logger.info(f"Content type: {file.content_type}")

    try:
        if not file.filename:
            raise HTTPException(400, "No file provided")

        # Check file type
        if not (file.content_type in ALLOWED_TYPES['document'] or
                any(file.content_type.startswith(vtype) for vtype in ALLOWED_TYPES['video'])):
            raise HTTPException(
                400,
                f"Invalid file type. Got {file.content_type}. Allowed types are PDF, Word documents, and videos"
            )

        # Save file to upload directory
        file_path = Path(TEMP_DIR) / file.filename

        try:
            # Read file content
            contents = await file.read()
            logger.info(f"Read file contents: {len(contents)} bytes")

            # Save file
            with file_path.open("wb") as buffer:
                buffer.write(contents)
            logger.info(f"Saved file to {file_path}")

            # Process document or video based on content type
            if file.content_type in ALLOWED_TYPES['document'] or file.filename.endswith('.py'):
                await process_document(file_path)
                file_type = "document"
            else:
                # Insert into Pixeltable as video
                docs_table = pxt.get_table('chatbot.documents')
                docs_table.insert([{
                    'video': str(file_path)
                }])
                file_type = "video"

            logger.info(f"Processed {file_type}: {file_path}")

            return JSONResponse(
                status_code=200,
                content={
                    "message": f"Successfully uploaded and processed {file.filename}",
                    "filename": file.filename,
                    "size": len(contents),
                    "type": file_type
                }
            )

        except Exception as e:
            logger.error(f"Error processing file: {str(e)}")
            if file_path.exists():
                file_path.unlink()
            raise HTTPException(500, f"Error processing file: {str(e)}")

    except HTTPException as he:
        logger.error(f"HTTP Exception: {str(he)}")
        raise he
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(500, f"Unexpected error: {str(e)}")

@app.get("/api/files")
async def list_files():
    try:
        docs_table = pxt.get_table('chatbot.documents')
        doc_results = docs_table.select(docs_table.document).collect().to_pandas()
        video_results = docs_table.select(docs_table.video).collect().to_pandas()

        files = []

        # Process documents
        for _, row in doc_results.iterrows():
            path = row['document']
            if not path:
                continue

            try:
                file_path = Path(path)
                if file_path.exists():
                    files.append({
                        "id": str(hash(file_path.name)),
                        "name": file_path.name,
                        "size": file_path.stat().st_size,
                        "type": "document",
                        "status": "success",
                        "uploadProgress": 100
                    })
            except Exception as e:
                logger.error(f"Error processing document path {path}: {e}")
                continue

        # Process videos
        for _, row in video_results.iterrows():
            path = row['video']
            if not path:
                continue

            try:
                file_path = Path(path)
                if file_path.exists():
                    files.append({
                        "id": str(hash(file_path.name)),
                        "name": file_path.name,
                        "size": file_path.stat().st_size,
                        "type": "video",
                        "status": "success",
                        "uploadProgress": 100
                    })
            except Exception as e:
                logger.error(f"Error processing video path {path}: {e}")
                continue

        # Sort files by type and name
        files.sort(key=lambda x: (x['type'], x['name']))

        return JSONResponse(
            status_code=200,
            content={"files": files}
        )

    except Exception as e:
        logger.error(f"Error listing files: {e}")
        raise HTTPException(500, f"Error listing files: {str(e)}")

@app.post("/api/videos/upload")
async def upload_video(file: UploadFile = File(...)):
    if not any(file.content_type.startswith(vtype) for vtype in ALLOWED_TYPES['video']):
        raise HTTPException(400, "Invalid video format")

    try:
        # Save video file
        file_path = Path(TEMP_DIR) / file.filename
        logger.info(f"Saving video to {file_path}")

        # Read and save file
        with file_path.open("wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Save to Pixeltable
        docs_table = pxt.get_table('chatbot.documents')
        full_path = str(file_path.absolute())

        # Insert into Pixeltable with normalized path
        docs_table.insert([{
            'video': full_path.replace(os.sep, '/')
        }])

        logger.info(f"Video saved and inserted into Pixeltable: {full_path}")

        return JSONResponse(
                status_code=200,
                content={
                    "message": f"Successfully uploaded video: {file.filename}",
                    "filename": file.filename,
                    "path": str(file_path)
                }
            )

    except Exception as e:
        logger.error(f"Error uploading video: {e}")
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(500, f"Error uploading video: {str(e)}")

@app.post("/api/audio/upload")
async def upload_audio(file: UploadFile = File(...)):
    if not any(file.content_type.startswith(atype) for atype in ALLOWED_TYPES['audio']):
        raise HTTPException(400, "Invalid audio format")

    try:
        file_path = Path(TEMP_DIR) / file.filename
        normalized_path = str(file_path.absolute()).replace(os.sep, '/')

        # Save file
        with file_path.open("wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Insert into Pixeltable
        docs_table = pxt.get_table('chatbot.documents')
        docs_table.insert([{
            'audio': normalized_path
        }])

        return JSONResponse(
            status_code=200,
            content={
                "message": f"Successfully uploaded audio: {file.filename}",
                "filename": file.filename,
                "path": normalized_path
            }
        )

    except Exception as e:
        logger.error(f"Error uploading audio: {e}")
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(500, f"Error uploading audio: {str(e)}")

@app.get("/api/videos")
async def list_videos():
    try:
        docs_table = pxt.get_table('chatbot.documents')
        results = docs_table.where(docs_table.video.is_not(None))\
                          .select(docs_table.video)\
                          .collect()

        videos = []
        for video_path in results['video']:
            if not video_path:
                continue

            try:
                file_path = Path(video_path)
                if file_path.exists():
                    videos.append({
                        "id": str(hash(video_path)),
                        "name": file_path.name,
                        "type": "video",
                        "status": "success"
                    })
            except Exception as e:
                logger.error(f"Error processing video path {video_path}: {e}")
                continue

        return JSONResponse(
            status_code=200,
            content={"videos": videos}
        )
    except Exception as e:
        logger.error(f"Error listing videos: {e}")
        raise HTTPException(500, str(e))

async def get_answer(question: str) -> str:
    docs_table = pxt.get_table('chatbot.documents')

    try:
        # Insert question
        docs_table.insert([{
            'question': question
        }])

        # Get answer using Pixeltable's collect() method
        result = docs_table.select(
            docs_table.answer
        ).where(
            docs_table.question == question
        ).collect()

        # Check if there are any results
        if len(result) == 0:
            return "No response was generated. Please try asking another question."

        # Get the first answer from the results
        answer = result['answer'][0]

        # Validate the answer
        if not answer or answer.strip() == "":
            return "An empty response was generated. Please try asking another question."

        return answer

    except Exception as e:
        logger.error(f"Error getting answer: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate response: {str(e)}"
        )

@app.post("/api/chat")
async def chat(message: ChatMessage):
    try:
        # Store user message
        conversations.insert([{
            'role': 'user',
            'content': message.message,
            'timestamp': datetime.now()
        }])

        # Get response from Pixeltable
        response = await get_answer(message.message)

        # Store assistant response
        conversations.insert([{
            'role': 'assistant',
            'content': response,
            'timestamp': datetime.now()
        }])

        return JSONResponse(
            status_code=200,
            content={
                "response": response,
                "used_files": []
            }
        )
    except Exception as e:
        logger.error(f"Error in chat: {e}")
        raise HTTPException(500, str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)