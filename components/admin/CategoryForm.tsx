'use client';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { CategoryFormState } from '@/app/admin/categories/actions';
import { SLUG_MAX, slugify } from '@/lib/slugify';
import { Alert } from '../primitives/Alert';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Input } from '../primitives/Input';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {pending ? 'Adding…' : 'Add category'}
    </Button>
  );
}

/**
 * Add a category (admin). The slug defaults to one made from the name and can't change once
 * saved, so it's shown as you type.
 */
export function CategoryForm({ action, storeLabel }: {
  action: (prev: CategoryFormState, formData: FormData) => Promise<CategoryFormState>;
  storeLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const e = state.errors ?? {};
  const [name, setName] = useState(state.values?.name ?? '');
  const auto = slugify(name);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {e.form ? <Alert tone="error">{e.form}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" name="name" required maxLength={80} value={name} onChange={(ev) => setName(ev.target.value)} error={e.name} placeholder="Garden & Outdoors" />
        <Input
          label="Slug"
          name="slug"
          maxLength={SLUG_MAX}
          defaultValue={state.values?.slug ?? ''}
          placeholder={auto || 'garden-and-outdoors'}
          error={e.slug}
          hint={`Optional. Used in links (/s?dept=${auto || 'slug'}) and can’t be changed later.`}
          className="font-mono"
        />
      </div>
      <Checkbox label={`List it in the ${storeLabel} nav`} name="list" defaultChecked={state.values ? state.values.list : true} />
      <div><Submit /></div>
    </form>
  );
}
