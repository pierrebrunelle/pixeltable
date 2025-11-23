import os
from typing import List, Optional
import pixeltable as pxt
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Pixeltable Starter App")

# Ensure Pixeltable initializes correctly
# It will use PIXELTABLE_HOME from environment or default to ~/.pixeltable

@app.on_event("startup")
async def startup_event():
    # Create a default directory for the app's tables
    try:
        pxt.create_dir('my_app', ignore_errors=True)
        print("Pixeltable initialized. 'my_app' directory ready.")
    except Exception as e:
        print(f"Warning during startup: {e}")

@app.get("/")
def read_root():
    return {"message": "Welcome to Pixeltable App Starter Kit. Visit /docs for API documentation."}

@app.get("/tables")
def list_tables():
    """List all tables in the my_app directory."""
    return {"tables": pxt.list_tables('my_app')}

class CreateTableRequest(BaseModel):
    name: str

@app.post("/tables")
def create_table(request: CreateTableRequest):
    """Create a new video table."""
    try:
        path = f"my_app.{request.name}"
        # Example: Creating a table that stores videos
        t = pxt.create_table(path, {'video': pxt.VideoType()}, ignore_errors=True)
        return {"message": f"Table {path} created", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class PublishRequest(BaseModel):
    table_name: str
    destination_uri: str
    access: str = "private" # or "public"

@app.post("/share/publish")
def publish_table(request: PublishRequest):
    """
    Publish a local table to Pixeltable Cloud.
    Requires PIXELTABLE_API_KEY environment variable to be set.
    """
    try:
        source_path = f"my_app.{request.table_name}"
        if request.access not in ["public", "private"]:
             raise HTTPException(status_code=400, detail="Access must be 'public' or 'private'")
             
        pxt.publish(
            source=source_path, 
            destination_uri=request.destination_uri,
            access=request.access
        )
        return {"message": f"Table {source_path} published to {request.destination_uri}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/share/replicate")
def replicate_table(remote_uri: str, local_name: str):
    """
    Replicate a table from Pixeltable Cloud.
    """
    try:
        local_path = f"my_app.{local_name}"
        pxt.replicate(remote_uri=remote_uri, local_path=local_path)
        return {"message": f"Replicated {remote_uri} to {local_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

