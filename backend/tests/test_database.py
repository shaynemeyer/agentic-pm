"""Tests for database initialisation and seed_db error handling (M2 remediation)."""
import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.database import Base, seed_db


@pytest.fixture
def memory_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        return maker

    maker = asyncio.run(_setup())

    async def _get():
        async with maker() as s:
            return s

    yield asyncio.run(_get())
    asyncio.run(engine.dispose())


def test_seed_db_rolls_back_on_commit_failure(memory_session):
    """seed_db must roll back and re-raise when the commit fails."""

    async def _run():
        with patch.object(memory_session, "commit", side_effect=RuntimeError("disk full")):
            with patch.object(memory_session, "rollback", new_callable=AsyncMock) as mock_rollback:
                with pytest.raises(RuntimeError, match="disk full"):
                    await seed_db(memory_session)
                mock_rollback.assert_awaited_once()

    asyncio.run(_run())


def test_seed_db_succeeds_on_empty_db(memory_session):
    """seed_db must populate columns and cards on a fresh database."""
    from sqlalchemy import select, func
    from app.models.board import KanbanColumn, KanbanCard

    async def _run():
        await seed_db(memory_session)
        col_count = (await memory_session.execute(select(func.count()).select_from(KanbanColumn))).scalar()
        card_count = (await memory_session.execute(select(func.count()).select_from(KanbanCard))).scalar()
        return col_count, card_count

    col_count, card_count = asyncio.run(_run())
    assert col_count == 5
    assert card_count == 8
