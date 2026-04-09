from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_auth_service() -> AuthService:
    return AuthService()


@router.post("/signup", response_model=AuthResponse)
async def signup(body: SignupRequest, svc: AuthService = Depends(get_auth_service)):
    try:
        res = await svc.signup(body)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, svc: AuthService = Depends(get_auth_service)):
    try:
        res = await svc.login(body)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

