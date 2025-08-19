
-- 1) Atualiza o trigger de criação de perfis para gravar teacher_id quando role='aluno'
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email, role, teacher_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'professor'),
    case
      when coalesce(new.raw_user_meta_data->>'role', 'professor') = 'aluno'
        then nullif(new.raw_user_meta_data->>'teacher_id', '')::uuid
      else null
    end
  );
  return new;
end;
$$;

-- 2) Permitir que professores atualizem perfis dos seus alunos
--    (inclusive quando o aluno acabou de ser criado e ainda não tem teacher_id)
create policy "Professores podem atualizar perfis de seus alunos"
on public.profiles
for update
using (
  role = 'aluno'
  and (teacher_id = auth.uid() or teacher_id is null)
)
with check (
  role = 'aluno' and teacher_id = auth.uid()
);

-- 3) Permitir que professores excluam seus alunos
create policy "Professores podem excluir seus alunos"
on public.profiles
for delete
using (role = 'aluno' and teacher_id = auth.uid());
