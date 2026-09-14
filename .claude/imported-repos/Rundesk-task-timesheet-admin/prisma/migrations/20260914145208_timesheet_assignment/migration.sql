-- AlterTable
ALTER TABLE `timesheetsubmission` ADD COLUMN `assignedAt` DATETIME(3) NULL,
    ADD COLUMN `assignedById` VARCHAR(191) NULL,
    ADD COLUMN `assignedToId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `TimesheetSubmission_workspaceId_assignedToId_status_idx` ON `TimesheetSubmission`(`workspaceId`, `assignedToId`, `status`);

-- AddForeignKey
ALTER TABLE `TimesheetSubmission` ADD CONSTRAINT `TimesheetSubmission_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimesheetSubmission` ADD CONSTRAINT `TimesheetSubmission_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
