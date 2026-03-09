"""add youtube url to songs

Revision ID: 25c6a8f6f5f1
Revises: 099217d88b76
Create Date: 2026-03-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '25c6a8f6f5f1'
down_revision: Union[str, None] = '099217d88b76'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('songs', sa.Column('youtube_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('songs', 'youtube_url')
