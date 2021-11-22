import React from "react"
import classNames from "classnames"
import * as AppPropTypes from "../prop_types"

import GroupLabelInput from "./group_label_input"
import styles from "./css_modules/group_label_container.css"
import sharedGroupLabelTextStyles from "./css_modules/shared/group_label_text.css"
import stages from "../configs/stages"

const { GROUPS_LABELING } = stages

const GroupLabelContainer = ({ groupWithAssociatedIdeasAndVotes, currentUser, actions, stage }) => {
  const displayGroupLabelInput = (currentUser.is_facilitator && stage === GROUPS_LABELING)
  const readonlyGroupLabelClasses = classNames("readonly-group-label", sharedGroupLabelTextStyles.groupLabelText, {
    unlabeled: !groupWithAssociatedIdeasAndVotes.label,
  })

  return (
    <div className={styles.wrapper}>
      {displayGroupLabelInput ? (
        <GroupLabelInput
          actions={actions}
          groupWithAssociatedIdeasAndVotes={groupWithAssociatedIdeasAndVotes}
        />
      ) : (
        <p
          className={readonlyGroupLabelClasses}
        >
          {groupWithAssociatedIdeasAndVotes.label || "Unlabeled"}
        </p>
      )}
    </div>
  )
}

GroupLabelContainer.propTypes = {
  stage: AppPropTypes.stage.isRequired,
  actions: AppPropTypes.actions.isRequired,
  currentUser: AppPropTypes.user.isRequired,
  groupWithAssociatedIdeasAndVotes: AppPropTypes.groupWithAssociatedIdeasAndVotes.isRequired,
}

export default GroupLabelContainer
