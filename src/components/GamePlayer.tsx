import type { GameId } from '../lib/gameCatalog'
import { DichopticGame } from './DichopticGame'
import { GaborGame } from './GaborGame'
import { BubbleRushGame } from './games/BubbleRushGame'
import { FixateGame } from './games/FixateGame'
import { MemoryMatchGame } from './games/MemoryMatchGame'
import { OrientGame } from './games/OrientGame'
import { PursuitGame } from './games/PursuitGame'
import { StarPopGame } from './games/StarPopGame'

export function GamePlayer({ gameId }: { gameId: GameId }) {
  switch (gameId) {
    case 'gabor':
      return <GaborGame />
    case 'dichoptic':
      return <DichopticGame />
    case 'pursuit':
      return <PursuitGame />
    case 'starPop':
      return <StarPopGame />
    case 'orient':
      return <OrientGame />
    case 'memory':
      return <MemoryMatchGame />
    case 'fixate':
      return <FixateGame />
    case 'bubbleRush':
      return <BubbleRushGame />
    default:
      return null
  }
}
