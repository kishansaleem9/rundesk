-- CreateTable
CREATE TABLE `workflows` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `condition_logic` ENUM('ALL', 'ANY') NOT NULL DEFAULT 'ALL',
    `template_key` VARCHAR(64) NULL,
    `list_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workflows_workspace_id_is_active_idx`(`workspace_id`, `is_active`),
    INDEX `workflows_workspace_id_template_key_list_id_idx`(`workspace_id`, `template_key`, `list_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `triggers` (
    `id` VARCHAR(191) NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `config` JSON NOT NULL,

    UNIQUE INDEX `triggers_workflow_id_key`(`workflow_id`),
    INDEX `triggers_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conditions` (
    `id` VARCHAR(191) NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `field` VARCHAR(64) NOT NULL,
    `operator` VARCHAR(32) NOT NULL,
    `value` JSON NOT NULL,

    INDEX `conditions_workflow_id_position_idx`(`workflow_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `actions` (
    `id` VARCHAR(191) NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,

    INDEX `actions_workflow_id_position_idx`(`workflow_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `automation_runs` (
    `id` VARCHAR(191) NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(64) NOT NULL,
    `event_type` VARCHAR(64) NOT NULL,
    `task_id` VARCHAR(64) NOT NULL,
    `depth` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('SUCCESS', 'SKIPPED', 'FAILED') NOT NULL,
    `conditions_passed` BOOLEAN NOT NULL,
    `event_payload` JSON NOT NULL,
    `condition_results` JSON NOT NULL,
    `action_results` JSON NOT NULL,
    `error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `automation_runs_workspace_id_created_at_idx`(`workspace_id`, `created_at`),
    INDEX `automation_runs_workflow_id_created_at_idx`(`workflow_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `triggers` ADD CONSTRAINT `triggers_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conditions` ADD CONSTRAINT `conditions_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actions` ADD CONSTRAINT `actions_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `automation_runs` ADD CONSTRAINT `automation_runs_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

