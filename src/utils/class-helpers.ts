/**
 * Utility functions for handling class-student relationships
 * Centralizes logic for extracting student information from class_participants
 * 
 * After full refactoring: All classes use class_participants exclusively
 */

interface ClassParticipant {
  student_id: string;
  status?: string;
  student?: {
    name: string;
    email: string;
  };
}

interface ClassWithParticipants {
  id: string;
  is_group_class: boolean;
  participants?: ClassParticipant[];
  // Legacy student_id field completely removed
}

/**
 * Gets list of student IDs from a class (individual or group)
 * @param classData - Class data with participants
 * @returns Array of student IDs
 */
export function getClassStudentIds(classData: ClassWithParticipants): string[] {
  return classData.participants?.map(p => p.student_id) || [];
}

/**
 * Checks if it's an individual class (exactly 1 student)
 */
export function isIndividualClass(classData: ClassWithParticipants): boolean {
  return !classData.is_group_class && getClassStudentIds(classData).length === 1;
}

/**
 * Gets primary student ID (for individual classes) or null (for group classes)
 */
export function getPrimaryStudentId(classData: ClassWithParticipants): string | null {
  const studentIds = getClassStudentIds(classData);
  return studentIds.length === 1 ? studentIds[0] : null;
}

/**
 * Gets complete list of participants (with profile data if available)
 */
export function getClassParticipants(classData: ClassWithParticipants): ClassParticipant[] {
  return classData.participants || [];
}

/**
 * Checks if a class has any participants
 */
export function hasParticipants(classData: ClassWithParticipants): boolean {
  return getClassStudentIds(classData).length > 0;
}

/**
 * Gets participant count
 */
export function getParticipantCount(classData: ClassWithParticipants): number {
  return getClassStudentIds(classData).length;
}
