/**
 * Utility functions for handling class-student relationships
 * Centralizes logic for extracting student information from class_participants
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
  student_id?: string | null; // Legacy - will be removed
  student?: {
    name: string;
    email: string;
  };
}

/**
 * Gets list of student IDs from a class (individual or group)
 * @param classData - Class data with participants
 * @returns Array of student IDs
 */
export function getClassStudentIds(classData: ClassWithParticipants): string[] {
  // Priority 1: Use participants (correct pattern)
  if (classData.participants && classData.participants.length > 0) {
    return classData.participants.map(p => p.student_id);
  }
  
  // Legacy fallback (temporary - will be removed after refactoring)
  if (classData.student_id) {
    return [classData.student_id];
  }
  
  return [];
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
  if (classData.participants && classData.participants.length > 0) {
    return classData.participants;
  }
  
  // Legacy fallback (temporary)
  if (classData.student_id && classData.student) {
    return [{
      student_id: classData.student_id,
      student: classData.student
    }];
  }
  
  return [];
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
