/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  EuiSearchBarProps,
  EuiBasicTableColumn,
  EuiButtonIcon,
  EuiConfirmModal,
  EuiInMemoryTable,
  EuiPopover,
  EuiContextMenu,
  EuiButton,
  EuiTableSelectionType,
  EuiEmptyPrompt,
  EuiContextMenuPanelDescriptor,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { WorkspacePermissionSetting } from './types';
import { WorkspacePermissionItemType } from './constants';
import { getPermissionModeId, isWorkspacePermissionSetting } from './utils';
import { useOpenSearchDashboards } from '../../../../opensearch_dashboards_react/public';
import { PermissionModeId, IWorkspaceResponse } from '../../../../../core/public';
import { AddCollaboratorButton } from './add_collaborator_button';
import { WorkspaceCollaboratorType } from '../../services/workspace_collaborator_types_service';
import {
  WORKSPACE_ACCESS_LEVEL_NAMES,
  accessLevelNameToWorkspacePermissionModesMap,
} from '../../constants';
import { WorkspaceCollaborator, WorkspaceCollaboratorAccessLevel } from '../../types';
import { BackgroundPic } from '../../assets/background_pic';

export type PermissionSetting = Pick<WorkspacePermissionSetting, 'id'> &
  Partial<WorkspacePermissionSetting>;

// TODO: Update PermissionModeId to align with WorkspaceCollaboratorAccessLevel
const permissionModeId2WorkspaceAccessLevelMap: {
  [key in PermissionModeId]: WorkspaceCollaboratorAccessLevel;
} = {
  [PermissionModeId.Owner]: 'admin',
  [PermissionModeId.Read]: 'readOnly',
  [PermissionModeId.ReadAndWrite]: 'readAndWrite',
};

const deletionModalConfirmButton = i18n.translate(
  'workspace.detail.collaborator.delete.modal.confirm',
  {
    defaultMessage: 'Confirm',
  }
);

const deletionModalCancelButton = i18n.translate(
  'workspace.detail.collaborator.delete.modal.cancel',
  {
    defaultMessage: 'Cancel',
  }
);

const deletionModalWarning = i18n.translate(
  'workspace.workspace.detail.collaborator.modal.delete.warning',
  {
    defaultMessage:
      'Currently you’re the only user who has access to the workspace as an owner. Share this workspace by adding collaborators.',
  }
);
const deletionModalConfirm = i18n.translate('workspace.detail.collaborator.modal.delete.confirm', {
  defaultMessage: 'Delete collaborator? The collaborators will not have access to the workspace.',
});

const convertPermissionSettingToWorkspaceCollaborator = (
  permissionSetting: WorkspacePermissionSetting
) => ({
  collaboratorId:
    permissionSetting.type === WorkspacePermissionItemType.User
      ? permissionSetting.userId
      : permissionSetting.group,
  permissionType: permissionSetting.type,
  accessLevel:
    permissionModeId2WorkspaceAccessLevelMap[getPermissionModeId(permissionSetting.modes)],
});

export const getDisplayedType = (
  supportCollaboratorTypes: WorkspaceCollaboratorType[],
  collaborator: WorkspaceCollaborator
) => {
  for (const collaboratorType of supportCollaboratorTypes) {
    const displayedType = collaboratorType.getDisplayedType?.(collaborator);
    if (displayedType) {
      return displayedType;
    }
  }
};

interface Props {
  permissionSettings: PermissionSetting[];
  displayedCollaboratorTypes: WorkspaceCollaboratorType[];
  handleSubmitPermissionSettings: (
    permissionSettings: WorkspacePermissionSetting[]
  ) => Promise<IWorkspaceResponse<boolean>>;
}

type PermissionSettingWithAccessLevelAndDisplayedType = PermissionSetting & {
  accessLevel?: string;
  displayedType?: string;
};

export const WorkspaceCollaboratorTable = ({
  permissionSettings,
  displayedCollaboratorTypes,
  handleSubmitPermissionSettings,
}: Props) => {
  const [selection, setSelection] = useState<PermissionSetting[]>([]);
  const {
    overlays,
    services: { notifications },
  } = useOpenSearchDashboards();

  const items: PermissionSettingWithAccessLevelAndDisplayedType[] = useMemo(() => {
    return permissionSettings.map((setting) => {
      const collaborator = isWorkspacePermissionSetting(setting)
        ? convertPermissionSettingToWorkspaceCollaborator(setting)
        : undefined;
      const basicSettings = {
        ...setting,
        // This is used for table display and search match.
        displayedType: collaborator
          ? getDisplayedType(displayedCollaboratorTypes, collaborator)
          : undefined,
        accessLevel: collaborator
          ? WORKSPACE_ACCESS_LEVEL_NAMES[collaborator.accessLevel]
          : undefined,
      };
      // Unique primary key and filter null value
      if (setting.type === WorkspacePermissionItemType.User) {
        return {
          ...basicSettings,
          // Id represents the index of the permission setting in the array, will use primaryId for displayed id
          primaryId: setting.userId,
        };
      } else if (setting.type === WorkspacePermissionItemType.Group) {
        return {
          ...basicSettings,
          primaryId: setting.group,
        };
      }
      return basicSettings;
    });
  }, [permissionSettings, displayedCollaboratorTypes]);

  const adminCollarboratorsNum = useMemo(() => {
    const admins = items.filter((item) => item.accessLevel === WORKSPACE_ACCESS_LEVEL_NAMES.admin);
    return admins.length;
  }, [items]);

  const emptyStateMessage = useMemo(() => {
    return (
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiEmptyPrompt
            title={
              <h3>
                {i18n.translate('workspace.workspaceDetail.collaborator.emptyState.title', {
                  defaultMessage: 'Your workspace doesn’t have any collaborators.',
                })}
              </h3>
            }
            titleSize="s"
            body={i18n.translate('workspace.workspaceDetail.collaborator.emptyState.body', {
              defaultMessage:
                'Currently you’re the only user who has access to the workspace as an owner. Share this workspace by adding collaborators.',
            })}
            actions={
              <AddCollaboratorButton
                displayedTypes={displayedCollaboratorTypes}
                permissionSettings={permissionSettings}
                handleSubmitPermissionSettings={handleSubmitPermissionSettings}
                fill={false}
              />
            }
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <BackgroundPic />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }, [displayedCollaboratorTypes, permissionSettings, handleSubmitPermissionSettings]);

  const openDeleteConfirmModal = ({
    onConfirm,
    selections,
  }: {
    onConfirm: () => void;
    selections: PermissionSettingWithAccessLevelAndDisplayedType[];
  }) => {
    const adminOfSelection = selections.filter(
      (item) => item.accessLevel === WORKSPACE_ACCESS_LEVEL_NAMES.admin
    ).length;
    const shouldShowWarning =
      adminCollarboratorsNum === adminOfSelection && adminCollarboratorsNum !== 0;
    const modal = overlays.openModal(
      <EuiConfirmModal
        title={i18n.translate('workspace.detail.collaborator.actions.delete', {
          defaultMessage: 'Delete collaborator',
        })}
        onCancel={() => modal.close()}
        onConfirm={onConfirm}
        cancelButtonText={deletionModalCancelButton}
        confirmButtonText={deletionModalConfirmButton}
      >
        <EuiText color={shouldShowWarning ? 'danger' : 'default'}>
          <p>{shouldShowWarning ? deletionModalWarning : deletionModalConfirm}</p>
        </EuiText>
      </EuiConfirmModal>
    );
    return modal;
  };

  const renderToolsLeft = () => {
    if (selection.length === 0) {
      return;
    }

    const onClick = () => {
      const modal = openDeleteConfirmModal({
        onConfirm: async () => {
          let newSettings = permissionSettings;
          selection.forEach(({ id }) => {
            newSettings = newSettings.filter((_item) => _item.id !== id);
          });
          const result = await handleSubmitPermissionSettings(
            newSettings as WorkspacePermissionSetting[]
          );
          if (result?.success) {
            notifications?.toasts?.addSuccess({
              title: i18n.translate('workspace.collaborator.delete.success.message', {
                defaultMessage:
                  'Delete collaborator{pluralSuffix, select, true {} other {s}} successfully.',
                values: {
                  pluralSuffix: selection.length === 1,
                },
              }),
            });
            setSelection([]);
            modal.close();
          }
        },
        selections: selection,
      });
    };

    return (
      <EuiButton
        color="danger"
        iconType="trash"
        onClick={onClick}
        data-test-subj="confirm-delete-button"
        size="s"
      >
        {i18n.translate('workspace.detail.collaborator.delete.button.info', {
          defaultMessage: 'Delete {num} collaborator{pluralSuffix, select, true {} other {s}}',
          values: {
            num: selection.length,
            pluralSuffix: selection.length === 1,
          },
        })}
      </EuiButton>
    );
  };

  const renderToolsRight = () => {
    if (selection.length === 0) {
      return;
    }
    return (
      <Actions
        permissionSettings={permissionSettings}
        isTableAction={false}
        selection={selection}
        handleSubmitPermissionSettings={handleSubmitPermissionSettings}
      />
    );
  };

  const search: EuiSearchBarProps = {
    box: {
      incremental: true,
    },
    compressed: true,
    filters: [
      {
        type: 'field_value_selection',
        field: 'displayedType',
        compressed: true,
        name: 'Type',
        multiSelect: 'or',
        options: Array.from(
          new Set(items.flatMap(({ displayedType }) => (!!displayedType ? [displayedType] : [])))
        ).map((item) => ({
          value: item,
          name: item,
        })),
      },
      {
        type: 'field_value_selection',
        field: 'accessLevel',
        compressed: true,
        name: 'Access level',
        multiSelect: 'or',
        options: Array.from(
          new Set(items.flatMap(({ accessLevel }) => (!!accessLevel ? [accessLevel] : [])))
        ).map((item) => ({
          value: item,
          name: item,
        })),
      },
    ],
    toolsLeft: renderToolsLeft(),
    toolsRight: renderToolsRight(),
  };

  const columns: Array<EuiBasicTableColumn<PermissionSettingWithAccessLevelAndDisplayedType>> = [
    {
      field: 'primaryId',
      name: i18n.translate('workspace.collaborator.id.name', {
        defaultMessage: 'ID',
      }),
      width: '30%',
    },
    {
      field: 'displayedType',
      name: i18n.translate('workspace.collaborator.type.name', {
        defaultMessage: 'Type',
      }),
      render: (displayedType: string) => displayedType || <>&mdash;</>,
      width: '30%',
    },
    {
      field: 'accessLevel',
      name: i18n.translate('workspace.collaborator.access.level.name', {
        defaultMessage: 'Access level',
      }),
      render: (accessLevel: string) => accessLevel || <>&mdash;</>,
      width: '30%',
    },
    {
      name: i18n.translate('workspace.collaborator.actions.name', {
        defaultMessage: 'Actions',
      }),
      field: '',
      width: '10%',
      align: 'right',
      render: (item: PermissionSettingWithAccessLevelAndDisplayedType) => (
        <Actions
          isTableAction={true}
          selection={[item]}
          permissionSettings={permissionSettings}
          handleSubmitPermissionSettings={handleSubmitPermissionSettings}
          openDeleteConfirmModal={openDeleteConfirmModal}
        />
      ),
    },
  ];
  const selectionValue: EuiTableSelectionType<PermissionSettingWithAccessLevelAndDisplayedType> = {
    onSelectionChange: (newSelection) => setSelection(newSelection),
  };

  return (
    <EuiInMemoryTable
      items={items}
      columns={columns}
      compressed={true}
      search={search}
      itemId="id"
      pagination={true}
      message={emptyStateMessage}
      isSelectable={true}
      selection={selectionValue}
    />
  );
};

const Actions = ({
  isTableAction,
  selection,
  permissionSettings,
  handleSubmitPermissionSettings,
  openDeleteConfirmModal,
}: {
  isTableAction: boolean;
  selection?: PermissionSettingWithAccessLevelAndDisplayedType[];
  permissionSettings: PermissionSetting[];
  handleSubmitPermissionSettings: (
    permissionSettings: WorkspacePermissionSetting[]
  ) => Promise<IWorkspaceResponse<boolean>>;
  openDeleteConfirmModal?: ({
    onConfirm,
    selections,
  }: {
    onConfirm: () => void;
    selections: PermissionSettingWithAccessLevelAndDisplayedType[];
  }) => { close: () => void };
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const {
    overlays,
    services: { notifications },
  } = useOpenSearchDashboards();

  const accessLevelOptions = (Object.keys(
    WORKSPACE_ACCESS_LEVEL_NAMES
  ) as WorkspaceCollaboratorAccessLevel[]).map((level) => ({
    name: WORKSPACE_ACCESS_LEVEL_NAMES[level],
    onClick: async () => {
      setIsPopoverOpen(false);
      if (selection) {
        const modal = overlays.openModal(
          <EuiConfirmModal
            title={i18n.translate('workspace.detail.collaborator.table.change.access.level', {
              defaultMessage: 'Change access level',
            })}
            onCancel={() => modal.close()}
            onConfirm={async () => {
              let newSettings = permissionSettings;
              selection.forEach(({ id }) => {
                newSettings = newSettings.map((item) =>
                  id === item.id
                    ? {
                        ...item,
                        modes: accessLevelNameToWorkspacePermissionModesMap[level],
                      }
                    : item
                );
              });
              const result = await handleSubmitPermissionSettings(
                newSettings as WorkspacePermissionSetting[]
              );
              if (result?.success) {
                notifications?.toasts?.addSuccess({
                  title: i18n.translate(
                    'workspace.detail.collaborator.change.access.success.title',
                    {
                      defaultMessage: 'The access level changed',
                    }
                  ),
                  text: i18n.translate('workspace.detail.collaborator.change.access.success.body', {
                    defaultMessage:
                      'The access level is changed to {level} for {num} collaborator{pluralSuffix, select, true {} other {s}}.',
                    values: {
                      level: WORKSPACE_ACCESS_LEVEL_NAMES[level],
                      num: selection.length,
                      pluralSuffix: selection.length === 1,
                    },
                  }),
                });
              }
              modal.close();
            }}
            cancelButtonText="Cancel"
            confirmButtonText="Confirm"
          >
            <EuiText>
              <p>
                {i18n.translate('workspace.detail.collaborator.changeAccessLevel.confirmation', {
                  defaultMessage:
                    'Do you want to change access level to {numCollaborators} collaborator{pluralSuffix, select, true {} other {s}} to "{accessLevel}"?',
                  values: {
                    numCollaborators: selection.length,
                    pluralSuffix: selection.length === 1,
                    accessLevel: WORKSPACE_ACCESS_LEVEL_NAMES[level],
                  },
                })}
              </p>
            </EuiText>
          </EuiConfirmModal>
        );
      }
    },
    icon: '',
  }));

  const panelItems = ([
    {
      id: 0,
      items: [
        {
          name: i18n.translate('workspace.detail.collaborator.actions.change.access', {
            defaultMessage: 'Change access level',
          }),
          panel: 1,
        },
        isTableAction && {
          name: i18n.translate('workspace.detail.collaborator.actions.delete', {
            defaultMessage: 'Delete collaborator',
          }),
          onClick: () => {
            setIsPopoverOpen(false);
            if (selection && openDeleteConfirmModal) {
              const modal = openDeleteConfirmModal({
                onConfirm: async () => {
                  let newSettings = permissionSettings;
                  selection.forEach(({ id }) => {
                    newSettings = newSettings.filter((_item) => _item.id !== id);
                  });
                  const result = await handleSubmitPermissionSettings(
                    newSettings as WorkspacePermissionSetting[]
                  );
                  if (result?.success) {
                    notifications?.toasts?.addSuccess({
                      title: i18n.translate('workspace.detail.collaborator.delete.success', {
                        defaultMessage:
                          'Delete collaborator{pluralSuffix, select, true {} other {s}} successfully.',
                        values: {
                          pluralSuffix: selection.length === 1,
                        },
                      }),
                    });
                  }
                  modal.close();
                },
                selections: selection,
              });
            }
          },
        },
      ].filter(Boolean),
    },
    {
      id: 1,
      title: i18n.translate('workspace.detail.collaborator.actions.change.access', {
        defaultMessage: 'Change access level',
      }),
      items: accessLevelOptions,
    },
  ] as unknown) as EuiContextMenuPanelDescriptor[];

  const button = isTableAction ? (
    <EuiButtonIcon
      aria-label="workspace-collaborator-table-actions"
      iconType="boxesHorizontal"
      onClick={() => setIsPopoverOpen(true)}
      data-test-subj="workspace-detail-collaborator-table-actions-box"
    />
  ) : (
    <EuiButton
      iconType="arrowDown"
      size="s"
      iconSide="right"
      onClick={() => setIsPopoverOpen(true)}
      data-test-subj="workspace-detail-collaborator-table-actions"
    >
      {i18n.translate('workspace.detail.collaborator.actions.', {
        defaultMessage: 'Actions',
      })}
    </EuiButton>
  );
  return (
    <EuiPopover
      id="workspace-detail-add-collaborator-action"
      button={button}
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      ownFocus={false}
    >
      <EuiContextMenu initialPanelId={0} size="m" panels={panelItems} />
    </EuiPopover>
  );
};
