
export type Entity = number;

export type Component<Name extends string, T extends object = {}> = T & { type: Name, };

export const createComponent = <
  Name extends string,
  T extends object = {}
>(name: Name, props: T): Component<Name, T> => ({
  type: name,
  ...props,
});

export const componentMaker = <
  Name extends string
>(name: Name) => <T extends object>(props: T): Component<Name, T> => ({
  type: name,
  ...props,
});

export type System<C extends Component<string>, R extends object = {}> = (app: App<C, R>) => void;

export const combineSystems = <
  C extends Component<string>,
  R extends object = {}
>(...systems: System<C, R>[]): System<C, R> => {
  return app => {
    systems.forEach(system => {
      system(app);
    });
  };
};

type MapComponentTypes<U, C> =
  U extends [infer H, ...infer TL] ?
  [C & { type: H }, ...MapComponentTypes<TL, C>] :
  U extends [infer T] ? [C & { type: T }, Entity] : [Entity];

export type ComponentArg<C extends Component<string>, R extends object = {}> = C | ((entity: Entity, app: App<C, R>) => C);

type KeepStrings<T> = T extends string ? T : never;

export type ComponentTypes<C extends Record<string, object>> = {
  [N in KeepStrings<keyof C>]: Component<N, C[N]>
}[KeepStrings<keyof C>];

export class App<C extends Component<string>, R extends object = {}> {
  private entities: Set<Entity>;
  private components: Map<C['type'], Map<Entity, Component<C['type']>>>;
  private startupSystems: System<C, R>[];
  private systems: System<C, R>[];
  private nextId = 0;
  public resources: R;

  constructor(resources: R) {
    this.resources = resources;
    this.entities = new Set();
    this.components = new Map();
    this.startupSystems = [];
    this.systems = [];
  }

  public addEntity(components: ComponentArg<C>[]) {
    const id = this.nextId++;
    this.entities.add(id);

    for (const comp of components) {
      if (typeof comp === 'function') {
        this.addComponent(id, comp(id, this));
      } else {
        this.addComponent(id, comp);
      }
    }

    const actions = {
      add: (component: C) => {
        this.addComponent(id, component);
        return actions;
      },
      id,
    };

    return actions;
  }

  public addComponent(entity: Entity, component: C): App<C, R> {
    const type = component.type;
    if (!this.components.has(type)) {
      this.components.set(type, new Map());
    }

    this.components.get(type)?.set(entity, component);

    return this;
  }

  public removeComponent(entity: Entity, componentType: C['type']): App<C, R> {
    this.components.get(componentType)?.delete(entity);
    return this;
  }

  public removeEntity(entity: Entity): App<C> {
    for (const type of this.components.keys()) {
      this.components.get(type)?.delete(entity);
    }

    this.entities.delete(entity);
    return this;
  }

  public getComponent<K extends C['type']>(id: Entity, type: K): C & { type: K } | undefined {
    return this.components.get(type)?.get(id) as C & { type: K };
  }

  public hasComponent<K extends C['type']>(id: Entity, type: K): boolean {
    return this.components.get(type)?.has(id) ?? false;
  }

  public addSystem(system: System<C, R>): App<C, R> {
    this.systems.push(system);
    return this;
  }

  public addStartupSystem(system: System<C, R>): App<C, R> {
    this.startupSystems.push(system);
    return this;
  }

  public getEntities = () => this.entities[Symbol.iterator];

  private storeQueryTuple<
    H extends C['type'],
    T extends C['type'][]
  >(head: H, tail: T, entity: Entity, tuple: any[]): void {
    tuple[0] = this.getComponent(entity, head);

    for (let i = 0; i < tail.length; i++) {
      const type = tail[i];
      tuple[i + 1] = this.getComponent(entity, type);
    }

    tuple[tail.length + 1] = entity;
  }

  public query<
    H extends C['type'],
    T extends C['type'][]
  >(head: H, ...tail: T): MapComponentTypes<[H, ...T], C>[] {
    const tuples: any[] = [];
    for (const entity of this.components.get(head)?.keys() ?? []) {
      if (tail.every(type => this.hasComponent(entity, type))) {
        const tuple = new Array(tail.length + 2);
        this.storeQueryTuple(head, tail, entity, tuple);
        tuples.push(tuple);
      }
    }

    return tuples;
  }

  public *queryIter<
    H extends C['type'],
    T extends C['type'][]
  >(head: H, ...tail: T): IterableIterator<MapComponentTypes<[H, ...T], C>> {
    const tuple = new Array(tail.length + 2);
    for (const entity of this.components.get(head)?.keys() ?? []) {
      if (tail.every(type => this.hasComponent(entity, type))) {
        this.storeQueryTuple(head, tail, entity, tuple);
        yield tuple as MapComponentTypes<[H, ...T], C>;
      }
    }
  }

  private step = () => {
    for (let i = 0; i < this.systems.length; i++) {
      this.systems[i](this);
    }

    requestAnimationFrame(this.step);
  };

  public run(): App<C, R> {
    this.startupSystems.forEach(system => {
      system(this);
    });

    this.step();
    return this;
  }
}

export const createApp = <C extends Component<string>, R extends object = {}>(resources: R) =>
  new App<C, R>(resources);