import type { GameId } from '../lib/gameCatalog'
import { DichopticGame } from './DichopticGame'
import { GaborGame } from './GaborGame'
import { BubbleRushGame } from './games/BubbleRushGame'
import { ContrastBalanceGame } from './games/ContrastBalanceGame'
import { FixateGame } from './games/FixateGame'
import { MemoryMatchGame } from './games/MemoryMatchGame'
import { OrientGame } from './games/OrientGame'
import { PursuitGame } from './games/PursuitGame'
import { SaccadeJumpGame } from './games/SaccadeJumpGame'
import { StarPopGame } from './games/StarPopGame'
import { StereoNearGame } from './games/StereoNearGame'
import { VergenceJumpGame } from './games/VergenceJumpGame'
import { BeadStringGame } from './games/BeadStringGame'

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
    case 'saccadeJump':
      return <SaccadeJumpGame />
    case 'stereoNear':
      return <StereoNearGame />
    case 'contrastBalance':
      return <ContrastBalanceGame />
    case 'vergenceJump':
      return <VergenceJumpGame />
    case 'beadString':
      return <BeadStringGame />
    default:
      return null
  }
}
