
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os


app = FastAPI(title="Church API Gateway", version="0.1.0")

# Permitir CORS para todos los orígenes (ajusta allow_origins si lo deseas más restrictivo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SERVICES = {
    "people": os.getenv("PEOPLE_SERVICE_URL", "http://people:8000"),
    "ministries": os.getenv("MINISTRIES_SERVICE_URL", "http://ministries:8000"),
    "events": os.getenv("EVENTS_SERVICE_URL", "http://events:8000"),
    "music": os.getenv("MUSIC_SERVICE_URL", "http://music:8000"),
    "comms": os.getenv("COMMS_SERVICE_URL", "http://comms:8000"),
    "groups": os.getenv("GROUPS_SERVICE_URL", "http://groups:8000"),
    "volunteers": os.getenv("VOLUNTEERS_SERVICE_URL", "http://volunteers:8000"),
    "calendar": os.getenv("CALENDAR_SERVICE_URL", "http://calendar:8000"),
    "security": os.getenv("SECURITY_SERVICE_URL", "http://security:8000"),
    "reports": os.getenv("REPORTS_SERVICE_URL", "http://reports:8000"),
    "pdfs": os.getenv("PDFS_SERVICE_URL", "http://pdfs:8000"),
    "consejeria": os.getenv("CONSEJERIA_SERVICE_URL", "http://consejeria:8000"),
    "multitracks": os.getenv("MULTITRACKS_SERVICE_URL", "http://multitracks:8000"),
}


HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


async def forward_request(service: str, path: str, request: Request) -> Response:
    base_url = SERVICES[service]
    url = f"{base_url}{path}"
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP_HEADERS
    }
    async with httpx.AsyncClient(timeout=None) as client:
        resp = await client.request(
            request.method,
            url,
            params=request.query_params,
            content=await request.body(),
            headers=headers,
        )
    response_headers = {
        k: v
        for k, v in resp.headers.items()
        if k.lower() not in HOP_BY_HOP_HEADERS
    }
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=response_headers,
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "gateway"}


@app.get("/")
def root():
    return {
        "message": "API Gateway listo",
        "services": list(SERVICES.keys()),
    }


@app.api_route("/people{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_people(path: str, request: Request):
    return await forward_request("people", path, request)


@app.api_route("/ministries{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_ministries(path: str, request: Request):
    return await forward_request("ministries", path, request)


@app.api_route("/events{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_events(path: str, request: Request):
    return await forward_request("events", path, request)


@app.api_route("/music{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_music(path: str, request: Request):
    return await forward_request("music", path, request)


@app.api_route("/comms{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_comms(path: str, request: Request):
    return await forward_request("comms", path, request)


@app.api_route("/groups{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_groups(path: str, request: Request):
    return await forward_request("groups", path, request)


@app.api_route("/volunteers{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_volunteers(path: str, request: Request):
    return await forward_request("volunteers", path, request)


@app.api_route("/calendar{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_calendar(path: str, request: Request):
    return await forward_request("calendar", path, request)


@app.api_route("/security{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_security(path: str, request: Request):
    return await forward_request("security", path, request)


@app.api_route("/reports{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_reports(path: str, request: Request):
    return await forward_request("reports", path, request)


@app.api_route("/pdfs{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_pdfs(path: str, request: Request):
    return await forward_request("pdfs", path, request)


@app.api_route("/consejeria{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_consejeria(path: str, request: Request):
    return await forward_request("consejeria", path, request)


@app.api_route("/multitracks{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_multitracks(path: str, request: Request):
    return await forward_request("multitracks", path, request)
