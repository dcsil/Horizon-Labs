from fastapi import APIRouter

router = APIRouter()

@router.get("")
def example():
    return {"message": "sample ok"}
