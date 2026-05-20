from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from app.api.deps_auth import get_current_claims, require_student
from app.schemas.auth import AuthResponse, AuthUser, ClaimAdminCodeRequest, LoginRequest, SignupRequest
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


@router.get("/me", response_model=AuthUser)
async def get_me(claims: dict = Depends(get_current_claims), svc: AuthService = Depends(get_auth_service)):
    try:
        return await svc.get_me(str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/claim-admin-code", response_model=AuthUser)
async def claim_admin_code(
    body: ClaimAdminCodeRequest,
    claims: dict = Depends(require_student),
    svc: AuthService = Depends(get_auth_service),
):
    try:
        return await svc.claim_admin_code(str(claims.get("sub", "")), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

