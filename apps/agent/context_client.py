from __future__ import annotations

import os
from typing import Any

import httpx


class ContextClient:
    def _base(self) -> str:
        return os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")

    def _secret(self) -> str:
        # Read at call time so dotenv can load after module import.
        return os.getenv("INTERNAL_API_SECRET", "")

    def _headers(self) -> dict[str, str]:
        return {"x-verba-internal": self._secret()}

    async def load(self, user_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                f"{self._base()}/api/internal/context",
                params={"userId": user_id},
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.json()

    async def lookup_room(self, room_name: str) -> dict[str, Any]:
        if not room_name:
            return {}
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{self._base()}/api/internal/room",
                params={"roomName": room_name},
                headers=self._headers(),
            )
            if response.status_code == 404:
                return {}
            response.raise_for_status()
            return response.json()

    async def save_call(self, payload: dict[str, Any]) -> None:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self._base()}/api/internal/calls",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
