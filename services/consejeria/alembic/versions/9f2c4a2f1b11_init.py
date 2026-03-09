"""init

Revision ID: 9f2c4a2f1b11
Revises: 
Create Date: 2026-03-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9f2c4a2f1b11'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'consejerias',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('solicitante_person_id', sa.Integer(), nullable=False),
        sa.Column('consejero_person_id', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.String(), nullable=False),
        sa.Column('motivo', sa.String(), nullable=False),
        sa.Column('observaciones', sa.String(), nullable=True),
        sa.Column('estado', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_consejerias_id'), 'consejerias', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_consejerias_id'), table_name='consejerias')
    op.drop_table('consejerias')
