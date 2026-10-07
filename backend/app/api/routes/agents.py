from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.agent import AgentCreate, AgentRead, AgentUpdate
from app.services.agent_service import agent_service

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentRead])
async def list_agents(db: AsyncSession = Depends(get_db)):
    return await agent_service.list_agents(db)


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(agent_in: AgentCreate, db: AsyncSession = Depends(get_db)):
    return await agent_service.create_agent(db, agent_in)


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")
    return AgentRead(
        id=agent.id,
        name=agent.name,
        role=agent.role,
        description=agent.description,
        system_prompt=agent.system_prompt,
        provider=agent.provider,
        model=agent.model,
        temperature=agent.temperature,
        tools=agent.tools_list,
        avatar=agent.avatar,
        is_default=agent.is_default,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
    )


@router.patch("/{agent_id}", response_model=AgentRead)
async def update_agent(
    agent_id: str,
    agent_in: AgentUpdate,
    db: AsyncSession = Depends(get_db),
):
    updated = await agent_service.update_agent(db, agent_id, agent_in)
    if not updated:
        raise HTTPException(status_code=404, detail="Agente não encontrado")
    return updated


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await agent_service.delete_agent(db, agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agente não encontrado")
    return None
