import React from 'react';

export const KanbanColumnSkeleton: React.FC = () => (
  <div className="w-80 flex-shrink-0 bg-slate-100/80 border border-slate-200/80 rounded-2xl p-3 flex flex-col gap-3 shadow-2xs">
    <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full shimmer-wave" />
        <div className="h-4 w-28 rounded-md shimmer-wave" />
      </div>
      <div className="h-5 w-6 rounded-full shimmer-wave" />
    </div>
    <div className="flex flex-col gap-2.5">
      {[1, 2, 3].map((n) => (
        <div key={n} className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col gap-2.5 transition-all">
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 rounded shimmer-wave" />
            <div className="h-4 w-12 rounded-md shimmer-wave" />
          </div>
          <div className="h-4 w-full rounded shimmer-wave" />
          <div className="h-3.5 w-4/5 rounded shimmer-wave" />
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
            <div className="h-4 w-16 rounded shimmer-wave" />
            <div className="h-6 w-6 rounded-full shimmer-wave" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const TaskListRowSkeleton: React.FC = () => (
  <div className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl mb-2 shadow-xs">
    <div className="flex items-center gap-3 w-2/5">
      <div className="h-4 w-14 rounded shimmer-wave" />
      <div className="h-4 w-3/4 rounded shimmer-wave" />
    </div>
    <div className="h-5 w-20 rounded-md shimmer-wave" />
    <div className="h-5 w-24 rounded-md shimmer-wave" />
    <div className="h-7 w-7 rounded-full shimmer-wave" />
  </div>
);

export const StatCardSkeleton: React.FC = () => (
  <div className="p-5 bg-white border border-slate-200/90 rounded-2xl flex flex-col gap-2 shadow-xs">
    <div className="flex items-center justify-between">
      <div className="h-4 w-28 rounded-md shimmer-wave" />
      <div className="h-8 w-8 rounded-xl shimmer-wave" />
    </div>
    <div className="h-8 w-20 rounded-lg shimmer-wave mt-1" />
    <div className="h-3.5 w-36 rounded-md shimmer-wave" />
  </div>
);

export const BacklogSprintSkeleton: React.FC = () => (
  <div className="flex flex-col gap-5">
    {[1, 2].map((s) => (
      <div key={s} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 rounded shimmer-wave" />
            <div className="h-5 w-36 rounded-md shimmer-wave" />
            <div className="h-4 w-20 rounded-md shimmer-wave" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-24 rounded-xl shimmer-wave" />
          </div>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          {[1, 2, 3].map((r) => (
            <div key={r} className="flex items-center justify-between p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl">
              <div className="flex items-center gap-3 w-1/2">
                <div className="h-4 w-12 rounded shimmer-wave" />
                <div className="h-4 w-3/5 rounded shimmer-wave" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-4 w-16 rounded-md shimmer-wave" />
                <div className="h-4 w-20 rounded-md shimmer-wave" />
                <div className="h-6 w-6 rounded-full shimmer-wave" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export const SummaryViewSkeleton: React.FC = () => (
  <div className="flex flex-col gap-6">
    <div className="h-24 bg-white rounded-2xl border border-slate-200/80 p-5 shimmer-wave" />
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-20 bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center gap-3 shimmer-wave" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="h-80 bg-white rounded-2xl border border-slate-200/80 p-5 shimmer-wave" />
      <div className="h-80 bg-white rounded-2xl border border-slate-200/80 p-5 shimmer-wave" />
    </div>
  </div>
);

