import throttle from "lodash/throttle"

import actionTypes from "./action_types"

const updateIdea = (ideaId, newAttributes) => ({
  type: actionTypes.IDEA_UPDATE_COMMITTED,
  ideaId,
  newAttributes,
})

const ideaDeletionRejected = ideaId => ({
  type: actionTypes.IDEA_DELETION_REJECTED,
  ideaId,
})

export const comprehensiveIdeaEditStateNullifications = {
  inEditState: false,
  liveEditText: null,
  isLocalEdit: null,
  editSubmitted: false,
}

// protects against drags potentially firing *after* drops that follow
const throttleOptions = { trailing: false }

export const _throttledPushOfDragToServer = throttle((retroChannel, idea) => {
  retroChannel.push("idea_dragged_in_grouping_stage", idea)
}, 40, throttleOptions)

export const actions = {
  updateIdea,
  addIdea: idea => ({
    type: actionTypes.IDEA_SUBMISSION_COMMITTED,
    idea,
  }),

  ideaDraggedInGroupingStage: idea => {
    return (dispatch, getState, retroChannel) => {
      dispatch(updateIdea(idea.id, { x: idea.x, y: idea.y, inEditState: true }))
      _throttledPushOfDragToServer(retroChannel, idea)
    }
  },

  submitIdeaEditAsync: ideaParams => {
    return (dispatch, getState, retroChannel) => {
      const updateIdeaAction = updateIdea(ideaParams.id, { editSubmitted: true })
      dispatch(updateIdeaAction)

      retroChannel.pushWithRetries("idea_edited", ideaParams, {
        onOk: updatedIdea => {
          dispatch({
            type: actionTypes.IDEA_UPDATE_COMMITTED,
            ideaId: updatedIdea.id,
            newAttributes: {
              ...updatedIdea,
              ...comprehensiveIdeaEditStateNullifications,
            },
          })
        },
        onErr: () => {
          dispatch({
            type: actionTypes.IDEA_UPDATE_REJECTED,
            ideaId: ideaParams.id,
            params: ideaParams,
          })
          if (!window.Honeybadger) return;

          Honeybadger.notify(`'idea_edited' push retries failed with params: ${JSON.stringify(ideaParams)}`)
        },
      })
    }
  },

  submitIdeaDeletionAsync: ideaId => {
    return (dispatch, getState, retroChannel) => {
      const push = retroChannel.push("idea_deleted", ideaId)

      const updateIdeaAction = updateIdea(ideaId, { deletionSubmitted: true })
      dispatch(updateIdeaAction)

      push.receive("error", () => {
        const ideaDeletionRejectedAction = ideaDeletionRejected(ideaId)
        dispatch(ideaDeletionRejectedAction)
      })
    }
  },

  initiateIdeaEditState: ideaId => {
    return (dispatch, getState, retroChannel) => {
      retroChannel.push("idea_edit_state_enabled", { id: ideaId })

      const updateIdeaAction = updateIdea(ideaId, { inEditState: true, isLocalEdit: true })
      dispatch(updateIdeaAction)
    }
  },

  cancelIdeaEditState: ideaId => {
    return (dispatch, getState, retroChannel) => {
      retroChannel.push("idea_edit_state_disabled", { id: ideaId })

      const updateIdeaAction = updateIdea(ideaId, comprehensiveIdeaEditStateNullifications)
      dispatch(updateIdeaAction)
    }
  },

  broadcastIdeaLiveEdit: params => {
    return (dispatch, getState, retroChannel) => {
      retroChannel.push("idea_live_edit", params)
    }
  },

  submitIdea: idea => {
    return (dispatch, getState, retroChannel) => {
      const push = retroChannel.push("idea_submitted", idea)

      push.receive("error", () => {
        dispatch({ type: actionTypes.IDEA_SUBMISSION_REJECTED })
      })
    }
  },

  broadcastIdeaTypingEvent: params => {
    return (dispatch, getState, retroChannel) => {
      retroChannel.push("idea_typing_event", params)
    }
  },

  deleteIdea: ideaId => ({
    type: actionTypes.IDEA_DELETION_COMMITTED,
    ideaId,
  }),
}

export const reducer = (state = [], action) => {
  switch (action.type) {
    case actionTypes.SET_INITIAL_STATE:
      return action.initialState.ideas
    case actionTypes.IDEA_SUBMISSION_COMMITTED:
      return [...state, action.idea]
    case actionTypes.IDEA_UPDATE_COMMITTED:
      return state.map(idea => (
        (idea.id === action.ideaId) ? { ...idea, ...action.newAttributes } : idea
      ))
    case actionTypes.IDEA_UPDATE_REJECTED: {
      const { ideaId, params } = action
      const nullifications = params.hasOwnProperty("x")
        ? comprehensiveIdeaEditStateNullifications
        : { editSubmitted: false }

      return state.map(idea => {
        return idea.id === ideaId ? { ...idea, ...nullifications } : idea
      })
    }
    case actionTypes.IDEA_DELETION_COMMITTED:
      return state.filter(idea => idea.id !== action.ideaId)
    case actionTypes.IDEA_DELETION_REJECTED:
      return state.map(idea => {
        return idea.id === action.ideaId ? { ...idea, deletionSubmitted: false } : idea
      })
    case actionTypes.RETRO_STAGE_PROGRESSION_COMMITTED:
      return action.payload.ideas ? action.payload.ideas : state
    default:
      return state
  }
}
