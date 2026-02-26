from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

Base = declarative_base()


async def get_session():
    async with async_session_maker() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session_maker() as session:
        from sqlalchemy import select, func
        from app.models.board import User
        result = await session.execute(select(func.count()).select_from(User))
        if result.scalar() == 0:
            await seed_db(session)


async def seed_db(session: AsyncSession):
    import logging
    _logger = logging.getLogger(__name__)

    from app.models.board import User, Board, BoardMember, KanbanColumn, KanbanCard

    user = User(id="user-1", username="user", password="password")
    alice = User(id="user-2", username="alice", password="password")
    bob = User(id="user-3", username="bob", password="password")
    for u in [user, alice, bob]:
        session.add(u)

    board = Board(id="board-1", title="Main Board", owner_id="user-1")
    session.add(board)

    for uid in ["user-1", "user-2", "user-3"]:
        session.add(BoardMember(board_id="board-1", user_id=uid))

    columns = [
        KanbanColumn(id="col-backlog", title="Backlog", position=0, board_id="board-1"),
        KanbanColumn(id="col-discovery", title="Discovery", position=1, board_id="board-1"),
        KanbanColumn(id="col-progress", title="In Progress", position=2, board_id="board-1"),
        KanbanColumn(id="col-review", title="Review", position=3, board_id="board-1"),
        KanbanColumn(id="col-done", title="Done", position=4, board_id="board-1"),
    ]
    for col in columns:
        session.add(col)

    cards = [
        KanbanCard(id="card-1", title="Align roadmap themes", details="Draft quarterly themes with impact statements and metrics.", column_id="col-backlog", position=0, created_by_id="user-1"),
        KanbanCard(id="card-2", title="Gather customer signals", details="Review support tags, sales notes, and churn feedback.", column_id="col-backlog", position=1, created_by_id="user-1"),
        KanbanCard(id="card-3", title="Prototype analytics view", details="Sketch initial dashboard layout and key drill-downs.", column_id="col-discovery", position=0, created_by_id="user-1"),
        KanbanCard(id="card-4", title="Refine status language", details="Standardize column labels and tone across the board.", column_id="col-progress", position=0, created_by_id="user-1"),
        KanbanCard(id="card-5", title="Design card layout", details="Add hierarchy and spacing for scanning dense lists.", column_id="col-progress", position=1, created_by_id="user-1"),
        KanbanCard(id="card-6", title="QA micro-interactions", details="Verify hover, focus, and loading states.", column_id="col-review", position=0, created_by_id="user-1"),
        KanbanCard(id="card-7", title="Ship marketing page", details="Final copy approved and asset pack delivered.", column_id="col-done", position=0, created_by_id="user-1"),
        KanbanCard(id="card-8", title="Close onboarding sprint", details="Document release notes and share internally.", column_id="col-done", position=1, created_by_id="user-1"),
    ]
    for card in cards:
        session.add(card)

    try:
        await session.commit()
    except Exception as exc:
        _logger.error("Failed to seed database: %s", exc)
        await session.rollback()
        raise
