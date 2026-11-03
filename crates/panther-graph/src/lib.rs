//! Commit-graph lane layout.
//!
//! Commits arrive in topological order (children before parents). Each lane
//! is a vertical track waiting for a specific commit. Laying out a commit
//! places it on the lane that waits for it, merges any other lanes waiting for
//! it, and hands its parents to lanes. The layout keeps its lane state between
//! calls, so history can be laid out page by page at O(page) cost.

use panther_domain::commit::{CommitId, CommitNode};

/// A line drawn within half a row, from lane `from` to lane `to`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Segment {
    pub from: u32,
    pub to: u32,
    pub color: u32,
}

/// How to draw one commit's row of the graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GraphRow {
    /// Lane holding the commit's dot.
    pub lane: u32,
    /// Color index of the commit's dot; the UI wraps it onto its palette.
    pub color: u32,
    /// Lines from the top edge of the row to its middle.
    pub top: Vec<Segment>,
    /// Lines from the middle of the row to its bottom edge.
    pub bottom: Vec<Segment>,
    /// Number of lanes this row needs horizontally.
    pub width: u32,
}

#[derive(Debug, Clone)]
struct Lane {
    expects: CommitId,
    color: u32,
}

/// A line entering a row from above, before the commit's lane is known.
struct Incoming {
    from: usize,
    ends_at_commit: bool,
    color: u32,
}

impl Incoming {
    fn resolve(self, node_lane: usize) -> Segment {
        Segment {
            from: to_u32(self.from),
            to: to_u32(if self.ends_at_commit {
                node_lane
            } else {
                self.from
            }),
            color: self.color,
        }
    }
}

/// A lane a commit connects down to, and whether the commit opened it.
struct ParentLane {
    index: usize,
    is_new: bool,
}

/// Lays out commits one at a time, remembering open lanes between calls.
#[derive(Debug, Clone, Default)]
pub struct GraphLayout {
    lanes: Vec<Option<Lane>>,
    next_color: u32,
}

impl GraphLayout {
    /// Lays out the next commit in topological order.
    pub fn push(&mut self, node: &CommitNode) -> GraphRow {
        let width_before = self.lanes.len();
        let top = self.incoming_segments(&node.id);
        let (lane, color) = self.lane_for(&node.id);
        let top = top
            .into_iter()
            .map(|incoming| incoming.resolve(lane))
            .collect();
        self.close_lanes_expecting(&node.id);
        let parent_lanes = self.assign_parents(node, lane, color);
        let bottom = self.bottom_segments(lane, &parent_lanes);
        self.trim_trailing_free_lanes();

        GraphRow {
            lane: to_u32(lane),
            color,
            top,
            bottom,
            width: to_u32(width_before.max(self.lanes.len()).max(lane + 1)),
        }
    }

    /// The lane already waiting for `id`, or a fresh one for a branch tip.
    fn lane_for(&mut self, id: &CommitId) -> (usize, u32) {
        if let Some((index, lane)) = self.lanes.iter().enumerate().find_map(|(index, lane)| {
            lane.as_ref()
                .filter(|lane| &lane.expects == id)
                .map(|lane| (index, lane.color))
        }) {
            return (index, lane);
        }
        let color = self.take_color();
        let index = self.free_lane(None);
        self.lanes[index] = Some(Lane {
            expects: id.clone(),
            color,
        });
        (index, color)
    }

    /// Lines entering the row, captured before a branch tip claims a lane so
    /// that a tip never gets a line from above.
    fn incoming_segments(&self, id: &CommitId) -> Vec<Incoming> {
        self.open_lanes()
            .map(|(index, lane)| Incoming {
                from: index,
                ends_at_commit: &lane.expects == id,
                color: lane.color,
            })
            .collect()
    }

    fn close_lanes_expecting(&mut self, id: &CommitId) {
        for slot in &mut self.lanes {
            if slot.as_ref().is_some_and(|lane| &lane.expects == id) {
                *slot = None;
            }
        }
    }

    /// Gives the first parent the commit's own lane and every other parent a
    /// lane: one already waiting for it, or a new one.
    fn assign_parents(
        &mut self,
        node: &CommitNode,
        node_lane: usize,
        color: u32,
    ) -> Vec<ParentLane> {
        let mut parents = node.parents.iter();
        let mut targets = Vec::with_capacity(node.parents.len());
        if let Some(first) = parents.next() {
            self.lanes[node_lane] = Some(Lane {
                expects: first.clone(),
                color,
            });
            targets.push(ParentLane {
                index: node_lane,
                is_new: false,
            });
        }
        for parent in parents {
            let target = if let Some(index) = self.lane_expecting(parent) {
                ParentLane {
                    index,
                    is_new: false,
                }
            } else {
                ParentLane {
                    index: self.open_lane_for(parent, node_lane),
                    is_new: true,
                }
            };
            targets.push(target);
        }
        targets
    }

    /// Opens a new lane (never the commit's own) waiting for `parent`.
    fn open_lane_for(&mut self, parent: &CommitId, node_lane: usize) -> usize {
        let color = self.take_color();
        let index = self.free_lane(Some(node_lane));
        self.lanes[index] = Some(Lane {
            expects: parent.clone(),
            color,
        });
        index
    }

    /// Every open lane continues downward. Lanes the commit connects to also
    /// get a line from the commit's dot; lanes created by this commit start at
    /// the dot, so they have only that line.
    fn bottom_segments(&self, node_lane: usize, parent_lanes: &[ParentLane]) -> Vec<Segment> {
        let mut segments = Vec::new();
        for (index, lane) in self.open_lanes() {
            let parent = parent_lanes.iter().find(|parent| parent.index == index);
            if parent.is_some() {
                segments.push(Segment {
                    from: to_u32(node_lane),
                    to: to_u32(index),
                    color: lane.color,
                });
            }
            let continues_from_above =
                index != node_lane && parent.is_none_or(|parent| !parent.is_new);
            if continues_from_above {
                segments.push(Segment {
                    from: to_u32(index),
                    to: to_u32(index),
                    color: lane.color,
                });
            }
        }
        segments
    }

    fn lane_expecting(&self, id: &CommitId) -> Option<usize> {
        self.lanes
            .iter()
            .position(|lane| lane.as_ref().is_some_and(|lane| &lane.expects == id))
    }

    fn open_lanes(&self) -> impl Iterator<Item = (usize, &Lane)> {
        self.lanes
            .iter()
            .enumerate()
            .filter_map(|(index, lane)| lane.as_ref().map(|lane| (index, lane)))
    }

    /// The leftmost free lane (never `reserved`), appending one if needed.
    fn free_lane(&mut self, reserved: Option<usize>) -> usize {
        let free = self
            .lanes
            .iter()
            .enumerate()
            .position(|(index, lane)| lane.is_none() && Some(index) != reserved);
        free.unwrap_or_else(|| {
            self.lanes.push(None);
            self.lanes.len() - 1
        })
    }

    fn take_color(&mut self) -> u32 {
        let color = self.next_color;
        self.next_color = self.next_color.wrapping_add(1);
        color
    }

    fn trim_trailing_free_lanes(&mut self) {
        while self.lanes.last().is_some_and(Option::is_none) {
            self.lanes.pop();
        }
    }
}

fn to_u32(value: usize) -> u32 {
    u32::try_from(value).expect("a graph never has more than u32::MAX lanes")
}
