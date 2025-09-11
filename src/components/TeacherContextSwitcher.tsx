import { ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTeacherContext } from "@/contexts/TeacherContext";

export function TeacherContextSwitcher() {
  const { teachers, selectedTeacherId, setSelectedTeacherId, loading } = useTeacherContext();

  if (loading || teachers.length <= 1) {
    return null;
  }

  const selectedTeacher = teachers.find(t => t.teacher_id === selectedTeacherId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="truncate">
              {selectedTeacher ? selectedTeacher.teacher_name : 'Selecionar Professor'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-full min-w-[200px]" align="start">
        {teachers.map((teacher) => (
          <DropdownMenuItem
            key={teacher.teacher_id}
            onClick={() => setSelectedTeacherId(teacher.teacher_id)}
            className={selectedTeacherId === teacher.teacher_id ? "bg-accent" : ""}
          >
            <div className="flex flex-col">
              <span className="font-medium">{teacher.teacher_name}</span>
              <span className="text-sm text-muted-foreground">{teacher.teacher_email}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}