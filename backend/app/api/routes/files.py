import io
from fastapi import APIRouter, File, HTTPException, UploadFile
import pypdf

router = APIRouter(prefix="/files", tags=["files"])

ALLOWED_EXTENSIONS = {
    "txt", "pdf", "csv", "json", "md", "markdown",
    "py", "js", "ts", "html", "css", "yaml", "yml", "xml", "sql"
}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Recebe um arquivo (PDF, TXT, CSV, JSON, Código), extrai o texto e o prepara para o agente."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")

    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Extensão '.{ext}' não suportada. Envie arquivos de texto, PDF, planilhas CSV ou código.",
        )

    content_bytes = await file.read()
    extracted_text = ""

    try:
        if ext == "pdf":
            reader = pypdf.PdfReader(io.BytesIO(content_bytes))
            pages_text = []
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    pages_text.append(f"--- Página {i + 1} ---\n{text.strip()}")
            extracted_text = "\n\n".join(pages_text)
        else:
            try:
                extracted_text = content_bytes.decode("utf-8")
            except UnicodeDecodeError:
                extracted_text = content_bytes.decode("latin-1", errors="replace")
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Não foi possível extrair o texto do arquivo '{file.filename}': {str(e)}",
        )

    char_count = len(extracted_text)
    preview = extracted_text[:300] + ("..." if char_count > 300 else "")

    return {
        "filename": file.filename,
        "extension": ext,
        "size_bytes": len(content_bytes),
        "character_count": char_count,
        "content": extracted_text,
        "preview": preview,
        "status": "ready",
        "message": f"Arquivo '{file.filename}' lido com sucesso ({char_count} caracteres).",
    }
